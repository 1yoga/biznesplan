require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans } = require('./db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const generatePlan = require('./services/openai');
const generateWord = require('./services/word');
const generatePrompt = require('./services/prompt');
const generatePromptForm2 = require('./services/prompt2');
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
          ? generatePromptForm2(data)
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

    // 1. Если уже оплачен и отправлен
    if (plan.is_paid) {
      return res.send('✅ Платёж уже подтверждён. План уже был отправлен на ваш email.');
    }

    // 2. Проверим у YooKassa свежий статус
    if (!plan.yookassa_payment_id) {
      return res.status(400).send('❌ Ошибка: не найден ID платежа');
    }

    const paymentInfo = await yookassa.getPayment(plan.yookassa_payment_id);
    const isPaid = paymentInfo.status === 'succeeded';

    if (!isPaid) {
      return res.send(`
        ⏳ Спасибо за оплату! Платёж обрабатывается...
        Пожалуйста, подождите несколько секунд и обновите страницу.
      `);
    }

    // 3. Обновим статус в базе, даже если план ещё не готов
    await db.update(plans).set({
      is_paid: true,
      paid_at: new Date(),
      yookassa_status: 'succeeded'
    }).where(eq(plans.id, id));

    // 4. План уже готов — отправим
    if (plan.status === 'completed' && plan.gpt_response) {
      const supportType = plan.form_data?.supportType;
      const structure = STRUCTURES[supportType] || STRUCTURES.default;

      const fullDocx = await generateWord(plan.gpt_response, structure);
      await sendFull(fullDocx, plan.email);

      await db.update(plans).set({
        sent_at: new Date()
      }).where(eq(plans.id, id));

      return res.send('🎉 Спасибо за оплату! Бизнес-план отправлен на ваш email.');
    }

    // 4.5. Повторная генерация, если была ошибка
    if (plan.status === 'error') {
      try {
        const prompt = plan.form_type === 'form2'
          ? generatePromptForm2(plan.form_data)
          : generatePrompt(plan.form_data);

        const response = await generatePlan(prompt);
        const clean = preprocessText(response);
        const supportType = plan.form_data?.supportType;
        const structure = STRUCTURES[supportType] || STRUCTURES.default;

        const fullDocx = await generateWord(clean, null, structure);
        await sendFull(fullDocx, plan.email);

        await db.update(plans).set({
          gpt_prompt: prompt,
          gpt_response: response,
          status: 'completed',
          sent_at: new Date(),
          updated_at: new Date()
        }).where(eq(plans.id, id));

        return res.send('🎉 Спасибо за оплату! Бизнес-план успешно восстановлен и отправлен на email.');
      } catch (retryErr) {
        console.error('❌ Ошибка при повторной генерации:', retryErr);
        return res.send(`
          ⚠️ Оплата прошла, но произошла ошибка при восстановлении бизнес-плана.
          Мы уведомлены и свяжемся с вами вручную.
          Вы также можете написать: buznesplan@yandex.com
        `);
      }
    }

    // 5. План ещё генерируется — предупредим
    return res.send(`
      ✅ Оплата прошла успешно!

      ⏳ Ваш бизнес-план ещё находится в обработке.
      Он будет отправлен автоматически, как только будет готов.
      Проверьте почту в течение 10–15 минут (папка "Спам" тоже).
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
    
    console.log(body)

    if (body.event !== 'payment.succeeded') return res.sendStatus(200);

    const payment = body.object;
    const planId = payment.metadata?.planId;

    if (!planId) return res.status(400).send('❌ Нет planId в metadata');

    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan || plan.is_paid) return res.sendStatus(200); // уже отправлен

    // Обновляем статус оплаты
    await db.update(plans).set({
      is_paid: true,
      paid_at: new Date(),
      yookassa_status: 'succeeded'
    }).where(eq(plans.id, planId));

    // Если план уже сгенерирован — отправляем
    if (plan.status === 'completed' && plan.gpt_response) {
      const supportType = plan.form_data?.supportType;
      const structure = STRUCTURES[supportType] || STRUCTURES.default;
      const fullDocx = await generateWord(plan.gpt_response, structure);

      await sendFull(fullDocx, plan.email);

      await db.update(plans).set({
        sent_at: new Date()
      }).where(eq(plans.id, planId));

      console.log(`📬 План по плану ${planId} отправлен по webhook`);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('❌ Ошибка в /yookassa-webhook:', err);
    return res.sendStatus(500);
  }
});

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
      if (/^[А-ЯA-Z][^:]+:$/.test(trimmed)) return `**${trimmed.replace(':', '')}**`;
      return trimmed;
    })
    .join('\n')
    .replace(/\(\d{2,4}–\d{2,4} слов\)/g, '');
}

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
