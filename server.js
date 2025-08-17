require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans, orders, documents, sections } = require('./db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
})
const generateWord = require('./services/word');
const generatePromptForm1 = require('./services/tilda/promptForm1');
const generatePromptForm2 = require('./services/tilda/promptForm2');
const generatePromptForm3 = require('./services/tilda/promptForm3');
const generatePromptForm4 = require('./services/tilda/promptForm4');
const generatePromptForExplanatory = require('./services/explanatory/generatePromptForExplanatory');
const generatePromptContract = require('./services/contract/generatePromptContract');
const { TILDA_STRUCTURE, systemPromptForm1, systemPromptContract, sectionTitles, systemPromptExplanatory} = require('./services/consts');

const YooKassa = require('yookassa');
const {sendFull, sendToAdminsOnly} = require("./services/mailer");
const {preprocessText, buildPaymentParams, safeGptCall} = require("./services/utils");
const generateWordForExplanatory = require("./services/explanatory/generateWordForExplanatory");
const generateWordForContract = require("./services/contract/generateWordForContract");
const {logs} = require("./schema");

const app = express();

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function logToDb(level, args) {
  const message = args.map(a => {
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ');

  db.insert(logs).values({
    level,
    message
  }).catch(e => originalError('❌ Ошибка записи в логи БД:', e));
}

console.log = (...args) => {
  originalLog(...args);
  logToDb('info', args);
};

console.warn = (...args) => {
  originalWarn(...args);
  logToDb('warn', args);
};

console.error = (...args) => {
  originalError(...args);
  logToDb('error', args);
};

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://biznesplan.online',
      'https://boxinfox.ru',
      'https://biznesplanonline.vercel.app',
      'https://zakazat-biznesplan.online'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204
}));
app.use(express.json());

app.post('/create-order', express.urlencoded({ extended: true }), async (req, res) => {
  const data = req.body;
  console.log('📥 Получены данные формы:', data);

  if (!data.email) {
    console.warn('❌ Нет email в данных формы');
    return res.status(400).json({ error: 'Не указан email' });
  }

  if (data.form !== 'general_no_idea' && data.form !== 'general_with_idea'&& data.form !== 'sockontract_no_idea'&& data.form !== 'sockontract_with_idea') {
    console.warn('❌ Некорректный form:', data.form);
    return res.status(400).json({ error: 'Некорректный form' });
  }

  const orderId = uuidv4();

  console.log('📝 Создаём заказ с ID:', orderId);

  await db.insert(orders).values({
    id: orderId,
    email: data.email,
    form_type: data.form,
    form_data: data,
    status: 'pending',
    yandex_client_id: data.yandex_client_id || null,
  });

  const returnUrl = data.source_url || 'https://zakazat-biznesplan.online';

  try {
    const amount = data.price;
    console.log('💳 Сумма платежа:', amount);

    const paymentPayload = buildPaymentParams({ amount, returnUrl, email: data.email, orderId });

    const yookassa = new YooKassa({
      shopId: process.env.YOOKASSA_SHOP_ID_PLAN,
      secretKey: process.env.YOOKASSA_SECRET_KEY_PLAN,
    });

    const payment = await yookassa.createPayment(paymentPayload, orderId);

    console.log('✅ Платёж успешно создан:', payment.id);

    await db.update(orders).set({
      yookassa_payment_id: payment.id,
      yookassa_status: payment.status
    }).where(eq(orders.id, orderId));

    return res.json({ confirmation_url: payment.confirmation.confirmation_url });

  } catch (err) {
    console.error('❌ Ошибка создания оплаты или записи заказа:', err);
    await db.update(orders).set({ status: 'error' }).where(eq(orders.id, orderId));
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/yookassa-webhook', express.json(), async (req, res) => {
  console.log('📥 Получены данные от yookassa-webhook:', req.body);

  const body = req.body;

  if (!body || body.event !== 'payment.succeeded') {
    return res.sendStatus(200); // игнорируем ненужные эвенты
  }

  const payment = body.object;
  const orderId = payment.metadata?.orderId;

  if (!orderId) {
    console.warn('❌ Нет orderid в metadata');
    return res.status(400).send('❌ Нет orderid');
  }

  try {
    const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

    if (!order) {
      console.warn(`❌ Заказ не найден по orderId: ${orderId}`);
      return res.sendStatus(404);
    }

    if (order.yookassa_status === 'succeeded') {
      console.log(`ℹ️ Оплата по заказу ${orderId} уже подтверждена`);
      return res.sendStatus(200);
    }

    const now = new Date();

    await db
        .update(orders)
        .set({
          yookassa_status: 'succeeded',
          is_paid: true,
          paid_at: now,
          updated_at: now,
        })
        .where(eq(orders.id, order.id));

    console.log(`✅ Оплата по заказу ${orderId} подтверждена. Генерируем.`);

    if (order.yandex_client_id) {
      try {
        await axios.get('https://mc.yandex.ru/collect', {
          params: {
            tid: '103573073', // ID счётчика
            cid: order.yandex_client_id,
            t: 'event',
            ea: 'payment_success',
            et: Math.floor(Date.now() / 1000), // timestamp в секундах
            dl: 'https://zakazat-biznesplan.online', // адрес сайта
            ms: 'eb6ec56f-37e7-41d1-847a-057fcb7064c4',
          }
        });
        console.log(`📡 Цель "payment_success" отправлена через Measurement Protocol для client_id: ${order.yandex_client_id}`);
      } catch (err) {
        console.warn('⚠️ Ошибка при отправке события через Measurement Protocol:', err.response?.data || err.message);
      }
    }

    const parsedFormData = typeof order.form_data === 'string'
        ? JSON.parse(order.form_data)
        : order.form_data;

    await startSectionGenerationForMultipleDocs({ orderId: order.id, email: order.email, data: parsedFormData }).catch(err => {
      console.error('❌ Ошибка в генерации документов:', err.message);
      console.error(err.stack);
    });

    await trySendTildaOrderById(order.id);

    return res.sendStatus(200);

  } catch (err) {
    console.error('❌ Ошибка при обработке Yookassa webhook:', err);
    return res.sendStatus(500);
  }

});

app.post('/biznesplan-webhook', express.urlencoded({ extended: true }), async (req, res) => {
  const data = req.body;
  console.log('📥 Получены данные формы от Tilda:', data);

  if (!data.email) {
    console.warn('❌ Нет email в данных формы');
    return res.status(200).send('Missing email');
  }

  if (!['form1', 'form2', 'form3', 'form4'].includes(data.form)) {
    console.warn('❌ Некорректный form:', data.form);
    return res.status(200).send('Invalid form');
  }

  let externalId;
  let paymentId;

  try {
    const parsedPayment = typeof data.payment === 'string' ? JSON.parse(data.payment) : data.payment;
    externalId = parsedPayment?.orderid;
    paymentId = parsedPayment?.systranid;
  } catch (err) {
    console.warn('⚠️ Не удалось распарсить поле payment:', data.payment);
  }

  if (!externalId) {
    console.warn('❌ Нет external orderId');
    return res.status(200).send('Missing external_id');
  }

  // 🛑 Проверка — заказ уже создан
  const existing = await db
      .select()
      .from(orders)
      .where(eq(orders.external_id, externalId))
      .limit(1);

  if (existing.length > 0) {
    console.warn(`⚠️ Заказ с external_id=${externalId} уже существует. Прерываем.`);
    return res.status(200).send(`Already exists: ${externalId}`);
  }

  const orderId = uuidv4();
  console.log(`📝 Создаём заказ ${orderId} для external_id=${externalId}`);

  await db.insert(orders).values({
    id: orderId,
    external_id: externalId,
    email: data.email,
    form_type: data.form,
    form_data: data,
    status: 'pending',
    yookassa_payment_id: paymentId,
    yookassa_status: 'pending',
    yandex_client_id: data.yandex_client_id || null
  });

  try {
    startSectionGenerationForMultipleDocs({ orderId: orderId, email: data.email, data }).catch(console.error);

    console.log(`✅ Заявка ${externalId} обработана, ID = ${orderId}`);
    return res.status(200).send(`Started: ${orderId}`);

  } catch (err) {
    console.error('❌ Ошибка при генерации:', err);
    await db.update(orders).set({ status: 'error' }).where(eq(orders.id, orderId));
    return res.status(200).send('Ошибка генерации');
  }
});

app.post('/yookassa-webhook-tilda', express.json(), async (req, res) => {
  console.log('📥 Получены данные от Yookassa:', req.body);

  const body = req.body;

  if (!body || body.event !== 'payment.succeeded') {
    return res.sendStatus(200); // игнорируем ненужные эвенты
  }

  const payment = body.object;
  const orderId = payment.metadata?.tilda_orderid;

  if (!orderId) {
    console.warn('❌ Нет tilda_orderid в metadata');
    return res.status(400).send('❌ Нет tilda_orderid');
  }

  try {
    const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.external_id, orderId)) // <-- именно external_id
        .limit(1);

    if (!order) {
      console.warn(`❌ Заказ не найден по external_id: ${orderId}`);
      return res.sendStatus(404);
    }

    if (order.yookassa_status === 'succeeded') {
      console.log(`ℹ️ Оплата по заказу ${orderId} уже подтверждена`);
      return res.sendStatus(200);
    }

    const now = new Date();

    await db
        .update(orders)
        .set({
          yookassa_status: 'succeeded',
          is_paid: true,
          paid_at: now,
          updated_at: now,
        })
        .where(eq(orders.id, order.id)); // тут можно по ID, потому что мы его уже получили

    console.log(`✅ Оплата по заказу ${orderId} подтверждена. Генерируем.`);

    if (order.yandex_client_id) {
      try {
        await axios.get('https://mc.yandex.ru/collect', {
          params: {
            tid: '101917287', // ID счётчика
            cid: order.yandex_client_id,
            t: 'event',
            ea: 'payment_success',
            et: Math.floor(Date.now() / 1000), // timestamp в секундах
            dl: 'https://zakazat-biznesplan.online', // адрес сайта
            ms: '9c046a1b-48fe-4a39-b0f9-ea1945dbace8',
          }
        });
        console.log(`📡 Цель "payment_success" отправлена через Measurement Protocol для client_id: ${order.yandex_client_id}`);
      } catch (err) {
        console.warn('⚠️ Ошибка при отправке события через Measurement Protocol:', err.response?.data || err.message);
      }
    }

    const parsedFormData = typeof order.form_data === 'string'
        ? JSON.parse(order.form_data)
        : order.form_data;

    await startSectionGenerationForMultipleDocs({ orderId: order.id, email: order.email, data: parsedFormData }).catch(err => {
      console.error('❌ Ошибка в генерации документов:', err.message);
      console.error(err.stack);
    });

    await trySendTildaOrderById(order.id);

    return res.sendStatus(200);

  } catch (err) {
    console.error('❌ Ошибка при обработке Yookassa webhook:', err);
    return res.sendStatus(500);
  }

});

app.post('/explanatory-submit', express.urlencoded({ extended: true }), async (req, res) => {
  const data = req.body;
  console.log('📥 Получены данные формы объяснительной:', data);

  const orderId = uuidv4();

  if (!data.email || !data.docType || !data.fullName || !data.description) {
    console.warn('❌ Не хватает обязательных полей');
    return res.status(200).send('Missing email');
  }

  await db.insert(orders).values({
    id: orderId,
    email: data.email,
    form_type: 'explanatory',
    form_data: data,
    status: 'pending',
  });

  const returnUrl = data.source_url || 'https://boxinfox.ru/spasibo_obyasnitelnaya';
  const amount = data.price || '299.00';

  try {
    console.log('💳 Создаём платёж на сумму:', amount);
    const paymentPayload = buildPaymentParams({ amount, returnUrl, email: data.email, orderId });
    const yookassa = new YooKassa({
      shopId: process.env.YOOKASSA_SHOP_ID_FORMS,
      secretKey: process.env.YOOKASSA_SECRET_KEY_FORMS,
    });
    const payment = await yookassa.createPayment(paymentPayload, orderId);

    console.log('✅ Платёж создан:', payment.id);

    await db.update(orders).set({
      yookassa_payment_id: payment.id,
      yookassa_status: payment.status,
    }).where(eq(orders.id, orderId));

    startSectionGenerationForMultipleDocs({ orderId, email: data.email, data }).catch(console.error);

    console.log(res)
    console.log(payment.confirmation.confirmation_url)

    return res.json({ confirmation_url: payment.confirmation.confirmation_url });

  } catch (err) {
    console.error('❌ Ошибка создания оплаты или записи заказа:', err);
    await db.update(orders).set({ status: 'error' }).where(eq(orders.id, orderId));
    return res.status(200).send('Ошибка сервера, попробуйте позже');
  }
});

app.post('/explanatory-webhook', express.urlencoded({ extended: true }), async (req, res) => {
  const data = req.body;
  console.log('📥 Получены данные формы от Tilda:', data);

  if (!data.email) {
    console.warn('❌ Нет email в данных формы');
    return res.status(200).send('Missing email');
  }

  if (data.form !== 'explanatory' && data.form !== 'contract') {
    console.warn('❌ Некорректный form:', data.form);
    return res.status(200).send('Invalid form');
  }

  let externalId;
  let paymentId;

  try {
    const parsedPayment = typeof data.payment === 'string' ? JSON.parse(data.payment) : data.payment;
    externalId = parsedPayment?.orderid;
    paymentId = parsedPayment?.systranid;
  } catch (err) {
    console.warn('⚠️ Не удалось распарсить поле payment:', data.payment);
  }

  if (!externalId) {
    console.warn('❌ Нет external orderId');
    return res.status(200).send('Missing external_id');
  }

  const existing = await db
      .select()
      .from(orders)
      .where(eq(orders.external_id, externalId))
      .limit(1);

  if (existing.length > 0) {
    console.warn(`⚠️ Заказ с external_id=${externalId} уже существует. Прерываем.`);
    return res.status(200).send(`Already exists: ${externalId}`);
  }

  const orderId = uuidv4();
  console.log(`📝 Создаём заказ ${orderId} для external_id=${externalId}`);

  await db.insert(orders).values({
    id: orderId,
    external_id: externalId,
    email: data.email,
    form_type: data.form,
    form_data: data,
    status: 'pending',
    yookassa_payment_id: paymentId,
    yookassa_status: 'pending',
  });

  try {
    startSectionGenerationForMultipleDocs({ orderId: orderId, email: data.email, data }).catch(console.error);
    console.log(`✅ Заявка ${externalId} обработана, ID = ${orderId}`);
    return res.status(200).send(`Started: ${orderId}`);
  } catch (err) {
    console.error('❌ Ошибка при генерации:', err);
    await db.update(orders).set({ status: 'error' }).where(eq(orders.id, orderId));
    return res.status(200).send('Ошибка генерации');
  }
});

app.post('/gpt-call', async (req, res) => {
  try {
    const { messages, temperature = 0.7, max_tokens = 8192 } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] обязателен' });
    }

    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature,
      max_tokens
    });

    return res.json(result);
  } catch (err) {
    console.error('❌ GPT ошибка в /gpt-call:', err);
    return res.status(500).json({ error: 'Ошибка генерации' });
  }
});

async function safeSendFull(docx, email, formType = 'plan', retries = 3, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await sendFull(docx, email, formType);
      return true;
    } catch (err) {
      console.error(`❌ Ошибка отправки письма (попытка ${i + 1}):`, err);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  return false;
}

async function trySendTildaOrderById(orderId, retries = 100, intervalMs = 30000) {
  for (let i = 0; i < retries; i++) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      console.error(`❌ Заказ ${orderId} не найден`);
      return;
    }

    if (order.status === 'completed' && !order.sent_at) {
      const buffers = await generateTildaBuffers(orderId); // 🔄 обновлять при каждой проверке

      if (buffers.length > 0) {
        const success = await safeSendFull(buffers.length === 1 ? buffers[0] : buffers, order.email, order.form_type);
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

async function startSectionGenerationForMultipleDocs({ orderId, email, data }) {
  let prompts;

  switch (data.form) {
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

    case 'explanatory':
      prompts = await generatePromptForExplanatory(data);
      break;

    case 'contract':
      prompts = [ generatePromptContract(data)];
      break;

    default:
      throw new Error(`Неизвестное имя формы: ${data.form}`);
  }

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const documentId = uuidv4();

    await db.insert(documents).values({
      id: documentId,
      order_id: orderId,
      gpt_prompt: prompt,
      doc_type: data.form,
      status: 'pending'
    });

    if (
        ['form1', 'form2', 'form3', 'form4'].includes(data.form)
    ) {
      console.log(data.form)
      await startSectionGeneration({
        documentId,
        basePrompt: prompt,
        systemPrompt: systemPromptForm1
      });
    }
    else if(data.form === 'explanatory'){
      await startExplanatoryGeneration({
        documentId,
        basePrompt: prompt
      });
    }
    else if(data.form === 'contract'){
      await startContractGeneration({
        documentId,
        basePrompt: prompt
      });
    }
  }

  const docsArray = await db.select().from(documents).where(eq(documents.order_id, orderId));
  if (docsArray.length && docsArray.every(doc => doc.status === 'completed')) {
    await db.update(orders).set({ status: 'completed', updated_at: new Date() }).where(eq(orders.id, orderId));
    console.log(`📦 Все документы сгенерированы. Статус заказа ${orderId} → 'completed'`);
    const buffers = await generateTildaBuffers(orderId);
    console.log('📨 Отправляем все документы администраторам...');
    const format = data.form === 'contract' ? 'doc' : 'docx'
    await sendToAdminsOnly(buffers, email, format);
    console.log('✅ Все документы отправлены администраторам');
  }
}

async function startExplanatoryGeneration({ documentId, basePrompt }) {
  try {
    const messages = [
      { role: 'system', content: systemPromptExplanatory },
      { role: 'user', content: basePrompt }
    ];

    const result = await safeGptCall({
      messages,
      max_tokens: 2048
    });

    const response = result.choices?.[0]?.message?.content || 'Ошибка генерации';
    const wordCount = response.split(/\s+/).filter(Boolean).length;

    await db.update(documents).set({
      gpt_response: response,
      word_count: wordCount,
      status: 'completed',
      updated_at: new Date()
    }).where(eq(documents.id, documentId));

    console.log(`📝 Объяснительная сгенерирована (${wordCount} слов)`);

  } catch (err) {
    console.error('❌ Ошибка генерации объяснительной:', err);
    await db.update(documents).set({
      status: 'error',
      updated_at: new Date()
    }).where(eq(documents.id, documentId));
  }
}

async function startContractGeneration({ documentId, basePrompt }) {
  try {
    const messages = [
      { role: 'system', content: systemPromptContract },
      { role: 'user', content: basePrompt }
    ];

    const result = await safeGptCall({
      messages,
      max_tokens: 2048
    });

    const response = result.choices?.[0]?.message?.content || 'Ошибка генерации';
    const wordCount = response.split(/\s+/).filter(Boolean).length;

    await db.update(documents).set({
      gpt_response: response,
      word_count: wordCount,
      status: 'completed',
      updated_at: new Date()
    }).where(eq(documents.id, documentId));

    console.log(`📝 Договор сгенерирован`);

  } catch (err) {
    console.error('❌ Ошибка генерации Договора:', err);
    await db.update(documents).set({
      status: 'error',
      updated_at: new Date()
    }).where(eq(documents.id, documentId));
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

async function generateTildaBuffers(orderId) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const docs = await db.select().from(documents).where(eq(documents.order_id, orderId));
  const buffers = await Promise.all(
    docs
      .filter(doc => doc.status === 'completed' && doc.gpt_response)
      .map(async doc => {
        const clean = preprocessText(doc.gpt_response);
        if (doc.doc_type === 'explanatory') {
          if (!order) {
            console.warn(`❌ Заказ ${orderId} не найден`);
            return [];
          }
          return await generateWordForExplanatory(order.form_data, clean);
        }
        if (doc.doc_type === 'contract') {
          if (!order) {
            console.warn(`❌ Заказ ${orderId} не найден`);
            return [];
          }
          return await generateWordForContract(order.form_data, clean);
        }
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
