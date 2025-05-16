require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans } = require('./db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const generatePlan = require('./services/openai');
const generateWord = require('./services/word');
const generatePrompt = require('./services/prompt');
const generatePrompt2 = require('./services/prompt2');
const generatePromptForm1 = require('./services/tilda/promptForm1');
const generatePlanTilda = require('./services/tilda/openai');
const { STRUCTURES } = require('./services/consts');

const YooKassa = require('yookassa');
const {sendFull, sendToAdminsOnly} = require("./services/mailer");
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
    });

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

app.post('/tilda-submit', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const data = req.body;

    console.log('📥 Получены данные формы от Tilda:', data);

    if (!data.email) {
      return res.status(400).json({ error: 'Не указан email' });
    }

    const id = uuidv4();

    await db.insert(plans).values({
      id,
      email: data.email,
      form_data: data,
      status: 'pending'
    });

    const prompt = data.formname === 'form1'
      ? generatePromptForm1(data)
      : generatePrompt(data);

    (async () => {
      try {
        const response = await generatePlanTilda(prompt);
        const clean = preprocessText(response);
        const supportType = data?.supportType;
        const structure = [
    "1. Краткое резюме",
    "2. Описание целей и задач проекта",
    "3. Анализ рыночной ниши",
    "4. Информация о проекте",
    "5. Описание продукта/услуги",
    "6. Производственный план",
    "7. Маркетинговый план",
    "8. Финансовый план",
    "9. Анализ возможных рисков"
  ];

        const fullDocx = await generateWord(clean, null, structure);
        await sendToAdminsOnly(fullDocx, data.email);

        await db.update(plans).set({
          gpt_prompt: prompt,
          gpt_response: response,
          status: 'completed',
          updated_at: new Date()
        }).where(eq(plans.id, id));
      } catch (err) {
        console.error('❌ Ошибка генерации для Tilda:', err);
        await db.update(plans).set({ status: 'error' }).where(eq(plans.id, id));
      }
    })();

    res.status(200).json({ success: true, message: 'Форма успешно принята. Проверьте почту после оплаты.' });
  } catch (err) {
    console.error('❌ Ошибка обработки формы от Tilda:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
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

function extractPreviewBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  let currentBlock = null;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = /^#\s+(.+)/.exec(trimmed);
    if (heading) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { title: heading[1], content: "" };
    } else if (currentBlock) {
      currentBlock.content += trimmed + "\n";
    }
  }

  if (currentBlock) blocks.push(currentBlock);

  return blocks.slice(0, 2);
}

function preprocessText(text) {
  return text.split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^\d+\.\s+/.test(trimmed)) return `### ${trimmed}`;
      if (/^[А-ЯA-Z][^:]+:$/.test(trimmed)) return `**${trimmed}**`;
      return trimmed;
    })
    .join('\n')
    .replace(/\(\d{2,4}–\d{2,4} слов\)/g, '');
}

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
