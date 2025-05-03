require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans } = require('./db'); // Drizzle config
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const generatePlan = require('./services/openai');
const generateWord = require('./services/word');
const sendMail = require('./services/mailer');
const generatePrompt = require('./services/prompt');

const app = express();

app.use(cors({
  origin: 'https://biznesplan.online',
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204
}));
app.use(express.json());

app.post('/generate', async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Нет данных формы' });

  const id = uuidv4();
  await db.insert(plans).values({
    id,
    email: data.email,
    form_data: data,
    status: 'pending'
  });

  res.json({ success: true, id });

  await (async () => {
      try {
          const prompt = generatePrompt(data);
          const response = await generatePlan(prompt);
          const clean = preprocessText(response);
          const docx = await generateWord(clean);

          await sendMail(docx, data.email);

          await db.update(plans).set({
              gpt_prompt: prompt,
              gpt_response: response,
              status: 'completed',
              updated_at: new Date()
          }).where(eq(plans.id, id));
      } catch (err) {
          console.error('Ошибка генерации:', err);
          await db.update(plans).set({status: 'error'}).where(eq(plans.id, id));
      }
  })();
});

app.get("/status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);

    if (!plan) {
      return res.status(404).json({ error: "План не найден" });
    }

    // Возвращаем только статус и, если готов, часть ответа
    const response = {
      status: plan.status,
    };

    if (plan.status === "completed") {
      response.preview = extractPreview(plan.gpt_response);
    }

    return res.json(response);

  } catch (err) {
    console.error("Ошибка при проверке статуса:", err);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

function extractPreview(fullText) {
  const lines = fullText.split("\n");
  const previewLines = lines.slice(0, 60); // Примерно 3–4 страницы
  return previewLines.join("\n");
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
