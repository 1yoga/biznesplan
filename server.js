require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans, orders, documents, sections } = require('./db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const generateWord = require('./services/word');
const generatePromptForm1 = require('./services/tilda/promptForm1');
const generatePromptForm2 = require('./services/tilda/promptForm2');
const generatePromptForm3 = require('./services/tilda/promptForm3');
const generatePromptForm4 = require('./services/tilda/promptForm4');
const { TILDA_STRUCTURE, systemPromptForm1, systemPromptForm2, sectionTitles} = require('./services/consts');

const YooKassa = require('yookassa');
const {sendToAdminsOnly} = require("./services/mailer");
const {preprocessText, buildPaymentParams} = require("./services/utils");
const { OpenAI } = require('openai')
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID
})
const yookassa = new YooKassa({
  shopId: process.env.YOOKASSA_SHOP_ID,
  secretKey: process.env.YOOKASSA_SECRET_KEY,
});

const app = express();

app.use(cors({
  origin: 'https://biznesplan.online',
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204
}));
app.use(express.json());


app.post('/tilda-submit', express.urlencoded({ extended: true }), async (req, res) => {
  const data = req.body;
  console.log('📥 Получены данные формы от Tilda:', data);

  if (!data.email) {
    console.warn('❌ Нет email в данных формы');
    return res.status(400).json({ error: 'Не указан email' });
  }

  if (!data.source_url) {
    console.warn('❌ Нет source_url в данных формы');
    return res.status(400).json({ error: 'Не указан source_url' });
  }

  if (data.formname !== 'form1' && data.formname !== 'form2' && data.formname !== 'form3' && data.formname !== 'form4') {
    console.warn('❌ Некорректный formname:', data.formname);
    return res.status(400).json({ error: 'Некорректный formname' });
  }

  const orderId = uuidv4();

  console.log('📝 Создаём заказ с ID:', orderId);

  await db.insert(orders).values({
    id: orderId,
    email: data.email,
    form_type: data.formname,
    form_data: data,
    status: 'pending'
  });

  const returnUrl = data.source_url || 'https://biznesplan.online';

  try {
    const amount = data.price;
    console.log('💳 Сумма платежа:', amount);

    const paymentPayload = buildPaymentParams({ amount, returnUrl, email: data.email, orderId });
    const payment = await yookassa.createPayment(paymentPayload, orderId);

    console.log('✅ Платёж успешно создан:', payment.id);

    await db.update(orders).set({
      yookassa_payment_id: payment.id,
      yookassa_status: payment.status
    }).where(eq(orders.id, orderId));

    startSectionGenerationForMultipleDocs({ orderId, email: data.email, data }).catch(console.error);

    return res.json({ confirmation_url: payment.confirmation.confirmation_url });

  } catch (err) {
    console.error('❌ Ошибка создания оплаты или записи заказа:', err);
    await db.update(orders).set({ status: 'error' }).where(eq(orders.id, orderId));
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});


async function startSectionGenerationForMultipleDocs({ orderId, email, data }) {
  let prompts;

  switch (data.formname) {
    case 'form1':
      prompts = [generatePromptForm1(data)];
      break;

    case 'form2':
      prompts = await generatePromptForm2(data);
      break;

    case 'form3':
      prompts = [generatePromptForm3(data)];
      break;

    case 'form4':
      prompts = await generatePromptForm4(data);
      break;

    default:
      throw new Error(`Неизвестное имя формы: ${data.formname}`);
  }

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const documentId = uuidv4();

    await db.insert(documents).values({
      id: documentId,
      order_id: orderId,
      gpt_prompt: prompt,
      doc_type: 'business_plan',
      status: 'pending'
    });

    await startSectionGeneration({
      documentId,
      basePrompt: prompt,
      systemPrompt: systemPromptForm1
    });
  }

  const docsArray = await db.select().from(documents).where(eq(documents.order_id, orderId));
  if (docsArray.length && docsArray.every(doc => doc.status === 'completed')) {
    await db.update(orders).set({ status: 'completed', updated_at: new Date() }).where(eq(orders.id, orderId));
    console.log(`📦 Все документы сгенерированы. Статус заказа ${orderId} → 'completed'`);
    const buffers = await generateTildaBuffers(orderId);
    console.log('📨 Отправляем все бизнес-планы администраторам...');
    await sendToAdminsOnly(buffers, email);
    console.log('✅ Все планы отправлены администраторам');
  }
}

async function startSectionGeneration({ documentId, basePrompt, systemPrompt }) {
  const sectionsToInsert = sectionTitles.map((s, idx) => {
    const prompt = idx === 0
      ? `${basePrompt}\n\n✏️ Напиши только раздел ${idx + 1} **«${s.title}»** (объем: около ${s.target_word_count} слов), начни свой ответ с # ${idx + 1}. ${s.title}`
      : `✏️ Напиши только раздел ${idx + 1} **«${s.title}»** (объем: около ${s.target_word_count} слов).`;

    return {
      id: uuidv4(),
      document_id: documentId,
      index: idx + 1,
      title: s.title,
      prompt,
      status: 'pending'
    };
  });

  await db.insert(sections).values(sectionsToInsert);

  const messages = [{ role: 'system', content: systemPrompt }];

  for (const section of sectionsToInsert) {
    try {
      await delay(5000)
      messages.push({ role: 'user', content: section.prompt });
      const result = await safeGptCall({ messages, max_tokens: 8192 });

      const response = result.choices?.[0]?.message?.content || 'Ошибка генерации';
      const wordCount = response.split(/\s+/).filter(Boolean).length;

      messages.push({ role: 'assistant', content: response });

      await db.update(sections).set({
        gpt_response: response,
        word_count: wordCount,
        status: 'completed',
        updated_at: new Date()
      }).where(eq(sections.id, section.id));

      console.log(`✅ Раздел ${section.index}: "${section.title}" (${wordCount} слов)`);

    } catch (err) {
      console.error(`❌ Ошибка генерации раздела "${section.title}":`, err);
      await db.update(sections).set({
        status: 'error',
        updated_at: new Date()
      }).where(eq(sections.id, section.id));
      return;
    }
  }

  // Сборка документа
  const readySections = await db.select().from(sections)
    .where(eq(sections.document_id, documentId))
    .orderBy(sections.index);

  const fullText = readySections
    .map(s => s.gpt_response)
    .join('\n\n');

  await db.update(documents).set({
    gpt_response: fullText,
    status: 'completed',
    updated_at: new Date()
  }).where(eq(documents.id, documentId));
}

async function safeGptCall({ messages, max_tokens = 8192, temperature = 0.7 }) {
  let retries = 5;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature,
        max_tokens
      });

      return response;
    } catch (err) {
      if (err.code === 'rate_limit_exceeded') {
        const retryAfter = err.headers?.['retry-after'] || 30;
        const waitTime = Number(retryAfter) * 1000;
        console.warn(`🚦 Rate limit. Ждём ${waitTime / 1000} сек...`);
        await delay(waitTime);
      } else {
        throw err; // если ошибка не связана с лимитом — пробрасываем
      }
    }
  }

  throw new Error('💥 Превышено количество попыток запроса к GPT (rate limit)');
}

async function generateTildaBuffers(orderId) {
  const docs = await db.select().from(documents).where(eq(documents.order_id, orderId));
  const buffers = await Promise.all(
    docs
      .filter(doc => doc.status === 'completed' && doc.gpt_response)
      .map(async doc => {
        const clean = preprocessText(doc.gpt_response);
        return await generateWord(clean, null, TILDA_STRUCTURE);
      })
  );

  if (buffers.length === 0) {
    console.warn(`⚠️ Нет готовых документов в generateTildaBuffers для orderId: ${orderId}`);
  }

  return buffers;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
