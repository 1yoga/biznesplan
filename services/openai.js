const { OpenAI } = require('openai')
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID
})

module.exports = async function generatePlan(prompt) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.5,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: 'Ты профессиональный бизнес-консультант.' },
      { role: 'user', content: prompt }
    ]
  })

  return completion.choices?.[0]?.message?.content || 'Ошибка генерации'
}
