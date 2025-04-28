module.exports = function generatePrompt(data) {
  try {
    console.log('📥 Входные данные для генерации промпта:', JSON.stringify(data, null, 2));

    if (!data) throw new Error('Нет данных формы для генерации промпта');

    const parts = [];

    if (data.supportType) parts.push(`- Тип поддержки: ${data.supportType}`);
    if (data.grantTarget) parts.push(`- Целевой банк/грант: ${data.grantTarget}`);
    if (data.businessField) parts.push(`- Сфера бизнеса: ${data.businessField}`);
    if (data.businessDescription) parts.push(`- Описание бизнеса: ${data.businessDescription}`);
    if (data.targetAudience) parts.push(`- Целевая аудитория: ${data.targetAudience}`);
    if (data.region) parts.push(`- Регион: ${data.region}`);
    if (data.budget) parts.push(`- Планируемый бюджет: ${data.budget}`);
    if (data.spendingPurpose) parts.push(`- На что пойдут средства: ${data.spendingPurpose}`);
    if (data.developmentPlan) parts.push(`- План развития: ${data.developmentPlan}`);
    if (data.paybackPeriod) parts.push(`- Срок окупаемости: ${data.paybackPeriod}`);
    if (data.expectedResults) parts.push(`- Ожидаемые результаты: ${data.expectedResults}`);
    if (data.clientsCount) parts.push(`- Количество клиентов: ${data.clientsCount}`);
    if (data.hasPremises) parts.push(`- Наличие помещения: ${data.hasPremises}`);
    if (data.businessExperience) parts.push(`- Опыт в бизнесе: ${data.businessExperience}`);
    if (data.experienceDescription) parts.push(`- Описание опыта: ${data.experienceDescription}`);
    if (data.ownInvestments) parts.push(`- Собственные вложения: ${data.ownInvestments}`);
    if (data.socialSignificance) parts.push(`- Социальная значимость: ${data.socialSignificance}`);
    if (data.additionalNotes) parts.push(`- Дополнительные пожелания: ${data.additionalNotes}`);

    const supportType = (data.supportType || '').toLowerCase();
    console.log('📌 Тип поддержки определён как:', supportType);

    const commonInstructions = `
Общие требования:
- Без упоминания количества слов или страниц в тексте.
- Каждый раздел начинай с четкого заголовка.
- Оформляй текст без Markdown-разметки.
- Делай нормальные абзацы для печати.
- Учитывай налогообложение (УСН, Патент, ОСН) в финансовых расчетах.
- Все суммы указывай в рублях.
`;

    let structure = '';

    if (supportType.includes('социальный контракт')) {
      structure = `
1. Название проекта и краткое описание
2. Сведения о заявителе
3. Описание планируемой деятельности
4. Маркетинговый анализ (спрос и конкуренты)
5. Финансовый план с расчётом налогов
6. Социальная значимость проекта
7. Выводы и обоснование достижимости целей
`;
    } else if (supportType.includes('грант')) {
      structure = `
1. Резюме проекта
2. Описание компании и команды
3. Анализ проблемы и потребности
4. Описание продукта или услуги
5. Анализ рынка и целевой аудитории
6. Маркетинговая стратегия и продвижение проекта
7. План реализации проекта
8. Финансовый план с расчётом налогов
9. Ожидаемые результаты и социальный эффект
10. Показатели эффективности и масштабирование
`;
    } else if (supportType.includes('кредит')) {
      structure = `
1. Краткое описание проекта
2. Сведения о заемщике
3. Цель кредитования
4. Описание бизнеса
5. Финансовый план с учётом налогов
6. График возврата кредита
7. Анализ рисков и способы их минимизации
8. Заключение о платежеспособности
`;
    } else {
      structure = `
1. Введение
2. Описание бизнеса
3. Описание товаров и услуг
4. Анализ рынка
5. Маркетинговая стратегия
6. Организационный план
7. Финансовый план с расчётом налогов
8. Выводы и перспективы
`;
    }

    return `
Ты профессиональный бизнес-консультант.  
Напиши подробный бизнес-план по следующей структуре:

${structure}

Основные требования:
${commonInstructions}

Входные данные пользователя:
${parts.join('\n')}

⚡ Пиши так, чтобы документ можно было сразу распечатать и подать в госорганы или банк.
    `;
  } catch (err) {
    console.error('❌ Ошибка при генерации промпта:', err.message, err.stack);
    throw err;
  }
};
