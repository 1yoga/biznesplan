const { OpenAI } = require('openai')
const {systemPromptForm1, systemPromptForm2, systemPromptForm3} = require("./consts");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID
})

module.exports = async function generatePlanTilda(prompt) {

  let systemPrompt = 'Ты профессиональный бизнес-консультант. Пиши в формате Markdown.'

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.7,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]
  })
  return completion.choices?.[0]?.message?.content || 'Ошибка генерации'
}
