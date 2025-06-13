const generatePromptExplanatory = require('./generatePromptExplanatory');
const {safeGptCall} = require("../utils");

module.exports = async function generatePromptForExplanatory(data) {
    try {
        const reasonSource = data.reasonSource?.trim();

        // Если пользователь сам указал причину — генерим 1 объяснительную
        if (reasonSource === 'У меня есть причина') {
            return [generatePromptExplanatory(data)];
        }

        // Если нужно придумать 3 варианта — просим GPT сгенерировать причины и описания
        const messages = [
            {
                role: 'system',
                content: 'Ты кадровик. Придумай 3 разных уважительных причины и краткое описание ситуации для объяснительной записки. Формат вывода строго соблюдай.'
            },
            {
                role: 'user',
                content: `Составь 3 причины и краткое описание каждой ситуации для объяснительной от сотрудника ${data.fullName}, занимающего должность ${data.position} в организации ${data.organization}. Инцидент произошёл ${data.incidentDate}. Формат:

1. Причина: ...\nОписание: ...
2. Причина: ...\nОписание: ...
3. Причина: ...\nОписание: ...`
            }
        ];

        const gptResponse = await safeGptCall({ messages, max_tokens: 1024 });
        const content = gptResponse.choices?.[0]?.message?.content || '';

        const matches = content.match(/\d+\.\s*Причина:\s*(.*?)\nОписание:\s*(.*?)(?=(\n\d+\.|$))/gs);

        if (!matches || matches.length === 0) {
            throw new Error('GPT не вернул корректный список причин и описаний');
        }

        return matches.map(entry => {
            const reason = entry.match(/Причина:\s*(.*)/)?.[1]?.trim();
            const description = entry.match(/Описание:\s*(.*)/)?.[1]?.trim();

            const filledData = {
                ...data,
                reason,
                description,
            };

            return generatePromptExplanatory(filledData);
        });
    } catch (err) {
        console.error('❌ Ошибка в generatePromptForExplanatory:', err.message);
        throw err;
    }
};
