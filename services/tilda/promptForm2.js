const { buildIdeasPrompt, buildPlanPrompt} = require("../utils");
const generatePlanTilda = require('../../services/tilda/openai');

async function generatePromptForm2(data) {
  const ideasPrompt = buildIdeasPrompt(data);

  // 1. Получаем текст с 3 идеями
  const ideasText = await generatePlanTilda(ideasPrompt, 'form2');

  // 2. Разбиваем по # Идея №X
  const ideaBlocks = ideasText.split(/#\s+Идея\s+№\d+/).map(s => s.trim()).filter(Boolean);

  if (ideaBlocks.length !== 3) {
    console.warn('⚠️ Ожидалось 3 идеи, но получено:', ideaBlocks.length);
  }

  return  ideaBlocks.map((idea, i) => buildPlanPrompt(data, idea, i));
}

module.exports = generatePromptForm2;
