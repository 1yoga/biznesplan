require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const generatePlan = require('./services/openai');
const generatePDF = require('./services/pdf');
const sendMail = require('./services/mailer');
const generatePrompt = require('./services/prompt'); // ⬅

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

    console.log('✍️ Сформированный промпт для GPT:\n', prompt); // 👈 тоже логируем

    const plan = await generatePlan(prompt);

    const pdfBuffer = await generatePDF(plan);

    await sendMail(pdfBuffer, data['wpforms[fields][20]']); // почта пользователя

    res.json({ success: true, message: 'Письмо отправлено' });

  } catch (err) {
    console.error('❌ Ошибка:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
