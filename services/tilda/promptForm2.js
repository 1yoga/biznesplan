const { buildIdeasPrompt, buildPlanPrompt } = require("../utils");
const generatePlanTilda = require('../../services/tilda/openai');

async function generatePromptForm2(data) {
  console.log('🚀 Старт генерации promptов для form2...');
  console.log('📬 Входные данные:', JSON.stringify(data, null, 2));

  const ideasPrompt = buildIdeasPrompt(data);
  console.log('🧠 Prompt для генерации идей:\n', ideasPrompt);

  // 1. Получаем текст с 3 идеями
  const ideasText = await generatePlanTilda(ideasPrompt, 'form2');
  console.log('📥 Полученные идеи:\n', ideasText);

  // 2. Разбиваем по заголовкам идей
  const ideaBlocks = ideasText
    .split(/#\s+Идея\s+№\d+/)
    .map(s => s.trim())
    .filter(Boolean);

  console.log(`📊 Количество распарсенных идей: ${ideaBlocks.length}`);
  ideaBlocks.forEach((idea, idx) => {
    console.log(`📌 Идея №${idx + 1}:\n`, idea);
  });

  if (ideaBlocks.length !== 3) {
    console.warn('⚠️ Ожидалось 3 идеи, но получено:', ideaBlocks.length);
  }

  const result = ideaBlocks.map((idea, i) => {
    const planPrompt = buildPlanPrompt(data, idea, i);
    console.log(`📝 Prompt для бизнес-плана №${i + 1}:\n`, planPrompt);
    return planPrompt;
  });

  console.log('✅ Генерация 3 promptов завершена.\n');

  return result;
}

module.exports = generatePromptForm2;
