require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, plans } = require('./db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const generatePlan = require('./services/openai');
const generateWord = require('./services/word');
const sendMail = require('./services/mailer');
const generatePrompt = require('./services/prompt');
const generatePromptForm2 = require('./services/prompt2');
const {STRUCTURES} = require("./services/consts");

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

      const fullDocx = await generateWord(clean);

      const previewDocx = await generateWord(clean, 2);
      const previewLink = `https://biznesplan.online/waiting-page/?id=${id}`;
      await sendMail(previewDocx, data.email, previewLink, fullDocx);

      await db.update(plans).set({
        gpt_prompt: prompt,
        gpt_response: response,
        status: 'completed',
        updated_at: new Date()
      }).where(eq(plans.id, id));
    } catch (err) {
      console.error('Ошибка генерации:', err);
      await db.update(plans).set({ status: 'error' }).where(eq(plans.id, id));
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

    const response = {
      status: plan.status,
    };

    return res.json(response);

  } catch (err) {
    console.error("Ошибка при проверке статуса:", err);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
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

app.post('/form2', async (req, res) => {
  const { data } = req.body;

  if (!data?.email) {
    return res.status(400).json({ error: 'Не указан email' });
  }

  const id = uuidv4();

  // Сохраняем заявку
  await db.insert(plans).values({
    id,
    email: data.email,
    form_data: data,
    status: 'pending'
  });

  // Возвращаем фронту, чтобы он редиректнул на страницу ожидания
  res.json({ success: true, id });

  // Фоновая генерация
  await (async () => {
    try {
      const prompt = generatePromptForm2(data);
      const response = await generatePlan(prompt);
      const clean = preprocessText(response);

      const previewDocx = await generateWord(clean, 2);      // первые 2 секции
      const fullDocx = await generateWord(clean);            // весь текст

      const previewLink = `https://biznesplan.online/waiting-page/?id=${id}`;
      await sendMail(previewDocx, data.email, previewLink, fullDocx);

      await db.update(plans).set({
        gpt_prompt: prompt,
        gpt_response: response,
        status: 'completed',
        updated_at: new Date()
      }).where(eq(plans.id, id));
    } catch (err) {
      console.error('❌ Ошибка генерации form2:', err);
      await db.update(plans).set({ status: 'error' }).where(eq(plans.id, id));
    }
  })();
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

function extractPreview(markdown) {
  const lines = markdown.split("\n");
  const htmlLines = [];

  let chapterCount = 0;
  let collecting = false;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith("# ")) {
      chapterCount++;
      if (chapterCount > 2) break;
      collecting = true;
      htmlLines.push(`<h1>${line.slice(2)}</h1>`);
      continue;
    }

    if (!collecting) continue;

    if (line.startsWith("## ")) {
      htmlLines.push(`<h2>${line.slice(3)}</h2>`);
    } else if (line.startsWith("### ")) {
      htmlLines.push(`<h3>${line.slice(4)}</h3>`);
    } else if (/^\*\*(.+?)\*\*$/.test(line)) {
      const content = line.replace(/^\*\*(.+?)\*\*$/, "$1");
      htmlLines.push(`<strong>${content}</strong>`);
    } else if (line.startsWith("- ")) {
      htmlLines.push(`<ul><li>${line.slice(2)}</li></ul>`);
    } else if (/^\d+\.\s+\*\*(.+?)\*\*:(.+)/.test(line)) {
      const [, bold, text] = line.match(/^\d+\.\s+\*\*(.+?)\*\*:(.+)/);
      htmlLines.push(`<p><strong>${bold}:</strong> ${text.trim()}</p>`);
    } else {
      htmlLines.push(`<p>${line}</p>`);
    }
  }

  return htmlLines.join("\n");
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
