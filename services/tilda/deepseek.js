const fetch = require('node-fetch');
const { systemPromptForm1, systemPromptForm2 } = require("../consts");

module.exports = async function generatePlanTilda(prompt, form) {
  let systemPrompt = 'Ты профессиональный бизнес-консультант. Пиши в формате Markdown.';

  if (form === 'form1') {
    systemPrompt = systemPromptForm1;
  }
  if (form === 'form2') {
    systemPrompt = systemPromptForm2;
  }

  console.log(systemPrompt)
  console.log(prompt)


  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat', // или deepseek-coder — по твоей задаче
      temperature: 0.7,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ошибка DeepSeek API: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Ошибка генерации';
};
