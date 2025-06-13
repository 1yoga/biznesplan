module.exports = function generatePromptExplanatory(data) {
    try {
        if (!data) throw new Error('Нет данных формы для генерации промпта');

        const parts = [];

        if (data.docType) parts.push(`- Назначение: ${data.docType}`);
        if (data.recipient) parts.push(`- ФИО и должность руководителя: ${data.recipient}`);
        if (data.fullName) parts.push(`- ФИО заказчика: ${data.fullName}`);
        if (data.organization) parts.push(`- Название учреждения: ${data.organization}`);
        if (data.position) parts.push(`- Позиция заказчика: ${data.position}`);
        if (data.incidentDate) parts.push(`- Дата инцидента: ${data.incidentDate}`);
        if (data.reason) parts.push(`- Причина: ${data.reason}`);
        if (data.description) parts.push(`- Описание ситуации: ${data.description}`);

        return `
Напиши объяснительную записку, оформленную в соответствии с ГОСТ Р 7.0.97-2016 (требования к оформлению организационно-распорядительных документов) используя данные заказчика. Документ должен быть структурированным, официальным и лаконичным.  

----- 

📥 Данные от заказчика:
${parts.join('\n')}
----- 

Требования:
📌 Формат и стиль:
- Пиши в Markdown:
  - \\# Заголовок\\ — раздел
  - \\## Подзаголовок\\ — по желанию
  - \\ - пункт списка\\ — списки
  - \\ жирный текст **\\ — акценты
Дополнительные указания: 
- Избегай разговорной лексики.  
- Не используй аббревиатуры без расшифровки.  
- Дату и подпись в конце не оставляй (они формируются отдельно)
- Объём не менее 200 слов
- Пиши всегда от первого лица: «я», «мой поступок».
`;
    } catch (err) {
        console.error('❌ Ошибка при генерации промпта:', err.message, err.stack);
        throw err;
    }
};