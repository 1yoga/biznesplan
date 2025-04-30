module.exports = function generatePrompt(data) {
  try {
    if (!data) throw new Error('Нет данных формы для генерации промпта');

    const parts = [];

    if (data.supportType) parts.push(`- Цель бизнес-плана: ${data.supportType}`);
    if (data.businessName) parts.push(`- Название бизнеса: ${data.businessName}`);
    if (data.businessForm) parts.push(`- Форма бизнеса: ${data.businessForm}`);
    if (data.businessDescription) parts.push(`- Описание деятельности: ${data.businessDescription}`);
    if (data.location) parts.push(`- Местоположение бизнеса: ${data.location}`);
    if (data.startupAmount) parts.push(`- Общая сумма для старта (включая собственные): ${data.startupAmount} руб.`);
    if (data.spendingPurpose) parts.push(`- На что пойдут средства: ${data.spendingPurpose}`);
    if (data.ownMoney) parts.push(`- Собственные вложения: ${data.ownMoney} руб.`);
    if (data.ownAssets) parts.push(`- Неденежные вложения: ${data.ownAssets}`);
    if (data.clientsPerMonth) parts.push(`- Ожидаемое количество клиентов в месяц: ${data.clientsPerMonth}`);
    if (data.productPrices) parts.push(`- Цены на товары/услуги: ${data.productPrices}`);
    if (data.targetClients) parts.push(`- Целевая аудитория: ${data.targetClients}`);
    if (data.competitors) parts.push(`- Конкуренты: ${data.competitors}`);
    if (data.advantages) parts.push(`- Преимущества бизнеса: ${data.advantages}`);
    if (data.needsRepair) parts.push(`- Нужен ли ремонт помещения: ${data.needsRepair}`);
    if (data.repairCost) parts.push(`- Стоимость ремонта: ${data.repairCost} руб.`);
    if (data.rawMaterials) parts.push(`- Источники сырья: ${data.rawMaterials}`);
    if (data.lifeImprovement) parts.push(`- Как бизнес улучшит ваше положение: ${data.lifeImprovement}`);
    if (data.socialImpact) parts.push(`- Социальная польза от бизнеса: ${data.socialImpact}`);
    if (data.hasExperience) parts.push(`- Наличие опыта в сфере: ${data.hasExperience}`);
    if (data.experienceDetails) parts.push(`- Подробности опыта: ${data.experienceDetails}`);
    if (data.paybackPeriod) parts.push(`- Срок окупаемости: ${data.paybackPeriod} месяцев`);
    if (data.risks) parts.push(`- Возможные риски: ${data.risks}`);
    if (data.hiringPlans) parts.push(`- Планы по найму работников: ${data.hiringPlans}`);

    const supportType = (data.supportType || '').toLowerCase();

    const commonInstructions = `
📌 Основные требования:
- Пиши в формате **Markdown**.
- Заголовки первого уровня через \`#\`, второго — через \`##\`.
- Для списков используй \`-\` (дефис и пробел).
- Без лишних рассуждений и воды.
- Финансовые разделы с расчётом налогообложения (УСН, Патент, ОСН).
- Стиль: строгий, деловой, без лишнего украшательства.
- Все суммы указывай в рублях.
- Готовый текст должен быть удобен для распечатки и подачи в госорганы или банк.
`;

    let structure = '';

    if (supportType.includes('социальный контракт')) {
      structure = `
1. Название проекта и краткое описание (300–400 слов)
2. Сведения о заявителе (200–300 слов)
3. Описание планируемой деятельности (400–500 слов)
4. Маркетинговый анализ: спрос, конкуренты (500–600 слов)
5. Финансовый план: затраты, доходы, налоги (800–1000 слов)
6. Социальная значимость проекта (400–500 слов)
7. Выводы и обоснование достижимости целей (300–400 слов)
`;
    } else if (supportType.includes('грант')) {
      structure = `
1. Резюме проекта (300–400 слов)
2. Описание компании и команды (400–500 слов)
3. Анализ проблемы и потребности (400–500 слов)
4. Описание продукта/услуги (500–600 слов)
5. Анализ рынка и целевой аудитории (500–600 слов)
6. Маркетинговая стратегия (500–600 слов)
7. План реализации проекта (600–800 слов)
8. Финансовый план с расчётом налогов (800–1000 слов)
9. Ожидаемые результаты и эффект (400–500 слов)
10. Показатели эффективности и масштабирование (400–500 слов)
`;
    } else if (supportType.includes('кредит')) {
      structure = `
1. Краткое описание проекта (300–400 слов)
2. Сведения о заёмщике (200–300 слов)
3. Цель кредитования (300–400 слов)
4. Описание бизнеса (400–500 слов)
5. Финансовый план с расчётом налогообложения (800–1000 слов)
6. График возврата кредита (400–500 слов)
7. Анализ рисков и план их минимизации (400–500 слов)
8. Заключение о платежеспособности (300–400 слов)
`;
    } else {
      structure = `
1. Введение и цели (300–400 слов)
2. Описание бизнеса (400–500 слов)
3. Описание товаров/услуг (400–500 слов)
4. Анализ рынка (400–500 слов)
5. Маркетинговая стратегия (400–500 слов)
6. Организационный план (300–400 слов)
7. Финансовый план с учётом налогов (800–1000 слов)
8. Выводы и перспективы (300–400 слов)
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
