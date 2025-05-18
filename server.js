require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans, orders, documents, sections } = require('./db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const generatePlan = require('./services/openai');
const generateWord = require('./services/word');
const generatePrompt = require('./services/prompt');
const generatePrompt2 = require('./services/prompt2');
const generatePromptForm1 = require('./services/tilda/promptForm1');
const generatePromptForm2 = require('./services/tilda/promptForm2');
const generatePlanTilda = require('./services/tilda/openai');
const { STRUCTURES, TILDA_STRUCTURE, systemPromptForm1, systemPromptForm2, sectionTitles} = require('./services/consts');

const YooKassa = require('yookassa');
const {sendFull, sendToAdminsOnly} = require("./services/mailer");
const {extractPreviewBlocks, preprocessText, buildPaymentParams} = require("./services/utils");
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

  if (data.formname !== 'form1' && data.formname !== 'form2') {
    console.warn('❌ Некорректный formname:', data.formname);
    return res.status(400).json({ error: 'Некорректный formname' });
  }

  const isForm1 = data.formname === 'form1';
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
    const amount = isForm1 ? process.env.FORM1_PRICE : process.env.FORM2_PRICE;
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
  const isForm1 = data.formname === 'form1';

  const prompts = isForm1
    ? [generatePromptForm1(data)]
    : await generatePromptForm2(data);

  const systemPrompt = isForm1 ? systemPromptForm1 : systemPromptForm2;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const documentId = uuidv4();

    await db.insert(documents).values({
      id: documentId,
      order_id: orderId,
      doc_type: 'business_plan',
      status: 'pending'
    });

    await startSectionGeneration({
      documentId,
      orderId,
      email,
      basePrompt: prompt,
      systemPrompt
    });

    // 🧩 Проверяем, все ли документы по заказу готовы
    const orderDocs = await db.select().from(documents).where(eq(documents.order_id, orderId));
    const docsArray = Array.isArray(orderDocs) ? orderDocs : [];

    const allDocsCompleted = docsArray.length > 0 && docsArray.every(doc => doc.status === 'completed');

    if (allDocsCompleted) {
      await db.update(orders).set({
        status: 'completed',
        updated_at: new Date()
      }).where(eq(orders.id, orderId));

      console.log(`📦 Все документы сгенерированы. Статус заказа ${orderId} → 'completed'`);
    }
  }
}

async function startSectionGeneration({ documentId, orderId, email, basePrompt, systemPrompt }) {
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
      messages.push({ role: 'user', content: section.prompt });
      const result = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 8192
      });

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

  const buffers = await generateTildaBuffers(orderId);
  console.log('📨 Отправляем все бизнес-планы администраторам...');
  await sendToAdminsOnly(buffers, email);
  console.log('✅ Все планы отправлены администраторам');
}


app.post('/tilda-submit-old', express.urlencoded({ extended: true }), async (req, res) => {
  const data = req.body;
  console.log('📥 Получены данные формы от Tilda:', data);

  if (!data.email) {
    console.warn('❌ Нет email в данных формы');
    return res.status(400).json({ error: 'Не указан email' });
  }

  if (data.formname !== 'form1' && data.formname !== 'form2') {
    console.warn('❌ Некорректный formname:', data.formname);
    return res.status(400).json({ error: 'Некорректный formname' });
  }

  const isForm1 = data.formname === 'form1';
  const orderId = uuidv4();

  console.log('📝 Создаём заказ с ID:', orderId);

  await db.insert(orders).values({
    id: orderId,
    email: data.email,
    form_type: data.formname,
    form_data: data,
    status: 'pending'
  });

  const returnUrl = `${data.source_url || 'https://biznesplan.online'}`;

  try {
    const amount = isForm1 ? process.env.FORM1_PRICE : process.env.FORM2_PRICE;
    console.log('💳 Сумма платежа:', amount);

    const paymentPayload = buildPaymentParams({ amount, returnUrl, email: data.email, orderId });

    const payment = await yookassa.createPayment(paymentPayload, orderId);

    console.log('✅ Платёж успешно создан:', payment.id);

    await db.update(orders).set({
      yookassa_payment_id: payment.id,
      yookassa_status: payment.status
    }).where(eq(orders.id, orderId));

    // Фон: генерация планов
    (async () => {
      try {
        console.log('⚙️ Начинаем генерацию бизнес-планов...');

        const prompts = isForm1
          ? [generatePromptForm1(data)]
          : await generatePromptForm2(data); // form2 → массив из 3-х

        for (let i = 0; i < prompts.length; i++) {
          const prompt = prompts[i];
          const documentId = uuidv4();
          console.log(`🧠 Генерация GPT для документа ${i + 1} / ${prompts.length}`);

          const response = await generatePlanTilda(prompt, data.formname);

          await db.insert(documents).values({
            id: documentId,
            order_id: orderId,
            doc_type: 'business_plan',
            gpt_prompt: prompt,
            gpt_response: response,
            status: 'completed'
          });

          console.log(`✅ Документ ${i + 1} успешно создан и записан в базу`);
        }

        const buffers = await generateTildaBuffers(orderId);

        console.log('📨 Отправляем все бизнес-планы администраторам...');
        await sendToAdminsOnly(buffers, data.email);
        console.log('✅ Все планы отправлены администраторам');

        await db.update(orders).set({
          status: 'completed',
          updated_at: new Date()
        }).where(eq(orders.id, orderId));

        console.log('📦 Статус заказа обновлён на "completed"');

      } catch (err) {
        console.error('❌ Ошибка генерации бизнес-планов в фоне:', err);
        await db.update(orders).set({ status: 'error' }).where(eq(orders.id, orderId));
      }
    })();

    return res.json({ confirmation_url: payment.confirmation.confirmation_url });

  } catch (err) {
    console.error('❌ Ошибка создания оплаты или записи заказа:', err);
    await db.update(orders).set({ status: 'error' }).where(eq(orders.id, orderId));
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/yookassa-webhook-tilda', express.json(), async (req, res) => {
  try {
    const body = req.body;
    console.log(body)

    if (body.event !== 'payment.succeeded') return res.sendStatus(200);

    const payment = body.object;
    const orderId = payment.metadata?.orderId;

    if (!orderId) return res.status(400).send('❌ Нет orderId в metadata');

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      console.warn(`❌ Заказ не найден по ID: ${orderId}`);
      return res.sendStatus(404);
    }

    if (order.yookassa_status === 'succeeded') return res.sendStatus(200);

    const now = new Date();

    await db.update(orders).set({
      yookassa_status: 'succeeded',
      is_paid: true,
      paid_at: now,
      updated_at: now,
    }).where(eq(orders.id, orderId));

    console.log(`✅ Оплата по заказу ${orderId} подтверждена`);
    await trySendTildaOrderById(orderId);

    return res.sendStatus(200);
  } catch (err) {
    console.error('❌ Ошибка в /yookassa-webhook:', err);
    return res.sendStatus(500);
  }
});

async function safeSendFull(docx, email, retries = 3, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await sendFull(docx, email);
      return true;
    } catch (err) {
      console.error(`❌ Ошибка отправки письма (попытка ${i + 1}):`, err);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  return false;
}

async function trySendTildaOrderById(orderId, retries = 30, intervalMs = 30000) {
  for (let i = 0; i < retries; i++) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      console.error(`❌ Заказ ${orderId} не найден`);
      return;
    }

    if (order.status === 'completed' && !order.sent_at) {
      const buffers = await generateTildaBuffers(orderId);

      if (buffers.length > 0) {
        const success = await safeSendFull(buffers.length === 1 ? buffers[0] : buffers, order.email);
        if (success) {
          await db.update(orders).set({ sent_at: new Date() }).where(eq(orders.id, orderId));
          console.log(`📨 Планы по заказу ${orderId} успешно отправлены клиенту`);
        } else {
          console.warn(`⚠️ Не удалось отправить письма клиенту ${order.email}`);
        }
      } else {
        console.warn(`⏳ Документы по заказу ${orderId} ещё не готовы`);
      }

      return;
    }

    console.log(`⏳ Заказ ${orderId} ещё не завершён. Попытка ${i + 1}/${retries}`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.warn(`⚠️ Документы по заказу ${orderId} не были отправлены после ${retries} попыток`);
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

app.post('/submit-and-pay', async (req, res) => {
  const { data, formType } = req.body;

  if (!data?.email) {
    return res.status(400).json({ error: 'Не указан email' });
  }

  const id = uuidv4();

  // Создаём пустую запись в БД
  await db.insert(plans).values({
    id,
    email: data.email,
    form_data: data,
    status: 'pending'
  });

  try {
    // === СНАЧАЛА создаём платёж ===
    const payment = await yookassa.createPayment({
      amount: {
        value: process.env.PLAN_PRICE || '990.00',
        currency: 'RUB',
      },
      confirmation: {
        type: 'redirect',
        return_url: `https://biznesplan.online/payment-success?id=${id}`,
      },
      capture: true,
      description: `Оплата бизнес-плана для ${data.email}`,
      metadata: { planId: id },
      receipt: {
        customer: { email: data.email },
        items: [{
          description: "Бизнес-план",
          quantity: 1,
          amount: {
            value: process.env.PLAN_PRICE || '990.00',
            currency: 'RUB'
          },
          vat_code: 1,
          payment_mode: 'full_payment',
          payment_subject: 'service'
        }]
      }
    }, id);

    // Обновляем план с ID платежа
    await db.update(plans).set({
      yookassa_payment_id: payment.id,
      yookassa_status: payment.status
    }).where(eq(plans.id, id));

    // === ФОН: начинаем генерацию ===
    (async () => {
      try {
        const prompt = formType === 'form2'
          ? generatePrompt2(data)
          : generatePrompt(data);

        const response = await generatePlan(prompt);
        const clean = preprocessText(response);
        const supportType = data?.supportType;
        const structure = STRUCTURES[supportType] || STRUCTURES.default;

        const fullDocx = await generateWord(clean, null, structure);
        await sendToAdminsOnly(fullDocx, data.email);

        await db.update(plans).set({
          gpt_prompt: prompt,
          gpt_response: response,
          status: 'completed',
          updated_at: new Date()
        }).where(eq(plans.id, id));
      } catch (err) {
        console.error('❌ Ошибка генерации в фоне:', err);
        await db.update(plans).set({ status: 'error' }).where(eq(plans.id, id));
      }
    })();

    // Отправляем ссылку на оплату СРАЗУ
    return res.json({ confirmation_url: payment.confirmation.confirmation_url });

  } catch (err) {
    console.error('❌ Ошибка при создании оплаты:', err);
    await db.update(plans).set({ status: 'error' }).where(eq(plans.id, id));
    return res.status(500).json({ error: 'Ошибка оплаты' });
  }
});

app.get('/payment-success', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('❌ Ошибка: отсутствует ID бизнес-плана');

  try {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    if (!plan) return res.status(404).send('❌ Бизнес-план не найден');

    if (plan.sent_at) {
      return res.send('✅ Платёж прошёл. Бизнес-план уже отправлен вам на почту.');
    }

    return res.send(`
      ✅ Оплата прошла успешно!

      ⏳ Ваш бизнес-план находится в обработке.
      Он будет отправлен на почту в течение 10–15 минут.
      Проверьте папку "Спам" на всякий случай.
    `);
  } catch (err) {
    console.error('❌ Ошибка в /payment-success:', err);
    return res.status(500).send('❌ Внутренняя ошибка. Попробуйте позже.');
  }
});

app.get('/preview/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    if (!plan || !plan.gpt_response) {
      return res.status(404).json({ error: 'Бизнес-план не найден' });
    }

    const supportType = plan.form_data?.supportType;
    const structure = STRUCTURES[supportType] || STRUCTURES.default;

    const previewBlocks = extractPreviewBlocks(plan.gpt_response);
    return res.json({ preview: previewBlocks, structure });
  } catch (err) {
    console.error('❌ Ошибка при получении превью:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/yookassa-webhook', express.json(), async (req, res) => {
  try {
    const body = req.body;

    if (body.event !== 'payment.succeeded') return res.sendStatus(200);
    const payment = body.object;
    const planId = payment.metadata?.planId;

    if (!planId) return res.status(400).send('❌ Нет planId в metadata');

    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan || plan.is_paid) return res.sendStatus(200);

    // Помечаем как оплаченный
    await db.update(plans).set({
      is_paid: true,
      paid_at: new Date(),
      yookassa_status: 'succeeded'
    }).where(eq(plans.id, planId));

    // Запускаем отправку в фоне
    await trySendPlanById(planId);

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Ошибка в /yookassa-webhook:', err);
    res.sendStatus(500);
  }
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function trySendPlanById(planId, retries = 30, intervalMs = 10000) {
  for (let i = 0; i < retries; i++) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) {
      console.error(`❌ План ${planId} не найден`);
      return;
    }

    if (plan.status === 'completed' && plan.gpt_response && plan.is_paid && !plan.sent_at) {
      const supportType = plan.form_data?.supportType;
      const structure = STRUCTURES[supportType] || STRUCTURES.default;
      const fullDocx = await generateWord(plan.gpt_response, structure);
      const success = await safeSendFull(fullDocx, plan.email);
      if (success) {
        await db.update(plans).set({ sent_at: new Date() }).where(eq(plans.id, planId));
        console.log(`📨 План ${planId} успешно отправлен`);
      } else {
        console.warn(`⚠️ План ${planId} не удалось отправить после ${retries} попыток`);
      }
      return;
    }

    // План не готов — ждём и пробуем снова
    console.log(`⏳ План ${planId} ещё не готов. Попытка ${i + 1}/${retries}`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.warn(`⚠️ План ${planId} так и не был сгенерирован после ${retries} попыток`);
}

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
