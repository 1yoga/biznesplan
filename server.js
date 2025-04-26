require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const generatePlan = require('./services/openai');
const generatePDF = require('./services/pdf');
const sendMail = require('./services/mailer');

// ✅ Настраиваем правильный CORS
const corsOptions = {
  origin: 'https://biznesplan.online',
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Нет prompt' });

  try {
    console.log('generatePlan');
    const plan = await generatePlan(prompt);

    console.log('generatePDF');
    const pdfBuffer = await generatePDF(plan);

    console.log('sendMail');
    await sendMail(pdfBuffer);

    return res.status(200).json({ success: true, message: 'Письмо отправлено' });
  } catch (err) {
    // ⚡ Логируем ошибку на сервере
    console.error('Ошибка генерации бизнес-плана или отправки письма:', err);

    return res.status(500).json({ success: false, message: err.message || 'Ошибка сервера' });
  }
});

app.listen(process.env.PORT || 3003, () =>
  console.log(`🚀 Server on port ${process.env.PORT || 3003}`)
);
