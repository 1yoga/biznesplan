const generatePromptExplanatory = require('./generatePromptExplanatory');
const { safeGptCall } = require('../utils');

module.exports = async function generatePromptForExplanatory(data) {
    try {
        const reasonSource = data.reasonSource?.trim();

        // Если пользователь сам ввёл причину — одна объяснительная
        if (reasonSource === 'У меня есть причина') {
            return [generatePromptExplanatory(data)];
        }

        // GPT придумывает причины для короткой ситуации вроде "опоздал на 2 часа"
        const messages = [
            {
                role: 'system',
                content: `Ты специалист по кадрам. По краткому описанию ситуации придумай 3 разные уважительные причины, объясняющие это поведение. Не повторяй формулировку описания. Ответ должен быть строго в формате:

1. Причина: ...
2. Причина: ...
3. Причина: ...`
            },
            {
                role: 'user',
                content: `Описание: ${data.description}`
            }
        ];

        const gptResponse = await safeGptCall({ messages, max_tokens: 512 });
        const content = gptResponse.choices?.[0]?.message?.content || '';

        const matches = content.match(/\d+\.\s*Причина:\s*(.*?)(?=\n\d+\.|$)/gs);

        if (!matches || matches.length === 0) {
            throw new Error('GPT не вернул корректный список причин');
        }

        return matches.map(entry => {
            const reason = entry.match(/Причина:\s*(.*)/)?.[1]?.trim();

            const filledData = {
                ...data,
                reason, // подставляем новую причину
            };

            return generatePromptExplanatory(filledData); // генерируем финальный prompt
        });
    } catch (err) {
        console.error('❌ Ошибка в generatePromptForExplanatory:', err.message);
        throw err;
    }
};
