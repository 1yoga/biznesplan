require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()

const generatePlan = require('./services/openai')
const generatePDF = require('./services/pdf')
const sendMail = require('./services/mailer')

const corsOptions = {
  origin: 'https://biznesplan.online',
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204 // 👈 чтобы OPTIONS всегда завершался удачно
};

app.use(cors(corsOptions));

app.options('*', cors(corsOptions));

app.options('/generate', cors(corsOptions));

app.post('/generate', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) return res.status(400).json({ error: 'Нет prompt' })

  try {
    console.log('generatePlan')
    const plan = await generatePlan(prompt)
    console.log('generatePDF')
    const pdfBuffer = await generatePDF(plan)
    console.log('sendMail')
    await sendMail(pdfBuffer)

    res.json({ success: true, message: 'Письмо отправлено' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 🚀 Старт сервера
app.listen(process.env.PORT || 3003, () =>
  console.log(`🚀 Server on port ${process.env.PORT || 3003}`)
)
