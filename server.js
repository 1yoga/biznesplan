require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()

const generatePlan = require('./services/openai')
const generatePDF = require('./services/pdf')
const sendMail = require('./services/mailer')

// 🔥 Вот здесь делаем правильный CORS
app.use(cors({
  origin: 'https://biznesplan.online', // 👈 Разрешаем только твой сайт
  methods: ['POST'],                    // 👈 Разрешаем только POST
  allowedHeaders: ['Content-Type']      // 👈 Разрешаем нужные заголовки
}))

app.use(express.json())

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

// 🚀 Слушаем порт
app.listen(process.env.PORT || 3003, () =>
  console.log(`🚀 Server on port ${process.env.PORT || 3003}`)
)
