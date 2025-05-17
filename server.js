require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans, orders, documents } = require('./db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const generatePlan = require('./services/openai');
const generateWord = require('./services/word');
const generatePrompt = require('./services/prompt');
const generatePrompt2 = require('./services/prompt2');
const generatePromptForm1 = require('./services/tilda/promptForm1');
const generatePromptForm2 = require('./services/tilda/promptForm2');
const generatePlanTilda = require('./services/tilda/openai');
const { STRUCTURES, TILDA_STRUCTURE, systemPromptForm1, systemPromptForm2} = require('./services/consts');

const YooKassa = require('yookassa');
const {sendFull, sendToAdminsOnly} = require("./services/mailer");
const {extractPreviewBlocks, preprocessText, buildPaymentParams} = require("./services/utils");
const OpenAI = require("openai");
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

app.post('/tilda-submit-by-sections', express.urlencoded({ extended: true }), async (req, res) => {
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
  }
}




app.post('/tilda-submit', express.urlencoded({ extended: true }), async (req, res) => {
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

async function trySendTildaOrderById(orderId, retries = 30, intervalMs = 10000) {
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

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
