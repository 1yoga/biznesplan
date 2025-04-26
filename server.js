require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()

const generatePlan = require('./services/openai')
const generatePDF = require('./services/pdf')
const sendMail = require('./services/mailer')

app.use(cors())
app.use(express.json())

app.post('/', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) return res.status(400).json({ error: 'Нет prompt' })

  try {
    const plan = await generatePlan(prompt)
    const pdfBuffer = await generatePDF(plan)
    await sendMail(pdfBuffer)

    res.json({ success: true, message: 'Письмо отправлено' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(3000, () => console.log('🚀 Server on http://localhost:3000'))
