require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const generatePlan = require('./services/openai');
const generateWord = require('./services/word');
const sendMail = require('./services/mailer');
const generatePrompt = require('./services/prompt');

const corsOptions = {
  origin: 'https://biznesplan.online',
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

app.post('/generate', async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Нет данных формы' });

  try {
    const prompt = generatePrompt(data);

    console.log('✍️ Сформированный промпт для GPT:\n', prompt);

    const plan = await generatePlan(prompt);

    console.log('✍️ Сформированный план:\n', plan);

    const cleanText = preprocessText(plan);

    console.log('✍️ Сформированный cleanText:\n', cleanText);

    const wordBuffer = await generateWord(cleanText);

    await sendMail(wordBuffer, data.email);

    res.json({ success: true, message: 'Письмо отправлено' });

  } catch (err) {
    console.error('❌ Ошибка:', err);
    res.status(500).json({ error: err.message });
  }
});

function preprocessText(text) {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      // Заголовки разделов
      if (/^\d+\.\s+/.test(trimmed)) {
        return `### ${trimmed}`;
      }
      // Подзаголовки вида "Финансовый план:" превращаем в жирный текст
      if (/^[А-ЯA-Z][^:]+:$/.test(trimmed)) {
        return `**${trimmed.replace(':', '')}**`;
      }
      return trimmed;
    })
    .join('\n')
    .replace(/\(\d{2,4}–\d{2,4} слов\)/g, ''); // Убираем все пометки про слова
}

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
