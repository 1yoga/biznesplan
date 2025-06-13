const { buildIdeasPrompt2, buildPlanPrompt2 } = require("../utils");
const generatePlanTilda = require('../openai');

async function generatePromptForm4(data) {
  console.log('🚀 Старт генерации promptов для form4...');
  console.log('📬 Входные данные:', JSON.stringify(data, null, 2));

  const ideasPrompt = buildIdeasPrompt2(data);

  // 1. Получаем текст с 3 идеями
  const ideasText = await generatePlanTilda(ideasPrompt);

  // 2. Разбиваем по заголовкам идей
  const ideaBlocks = ideasText
    .split(/#\s+Идея\s+№\d+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (ideaBlocks.length !== 3) {
    console.warn('⚠️ Ожидалось 3 идеи, но получено:', ideaBlocks.length);
  }

  const result = ideaBlocks.map((idea, i) => {
    return buildPlanPrompt2(data, idea, i);
  });

  console.log('✅ Генерация 3 promptов завершена.\n');

  return result;
}

module.exports = generatePromptForm4;
