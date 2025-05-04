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
    if (data.risks) parts.push(`- Возможные риски: ${data.risks}`);
    if (data.hiringPlans) parts.push(`- Планы по найму работников: ${data.hiringPlans}`);

        // 🧠 Логика распознавания ФИО в названии при ИП/самозанятый
    let personalFormNote = '';
    if (
      ["ИП", "Самозанятый"].includes(data.businessForm) &&
      /\b[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+/.test(data.businessName || '')
    ) {
      personalFormNote = '- ⚠️ Пиши от **первого лица** (я, мой бизнес), а не от третьего (он, её, его).';
    }

    const commonInstructions = `
📌 Формат и стиль:
- Пиши в **Markdown**:
  - \`# Заголовок\` — раздел
  - \`## Подзаголовок\` — по желанию
  - \`- пункт списка\` — списки
  - \`**жирный текст**\` — для акцентов
- **Не пиши содержимое для "Титульного листа" и "Содержания"** — они будут сгенерированы отдельно.
- Строгий деловой стиль. Без "воды", метафор, украшений.
- Без упоминания ОКВЭД, Canvas, SWOT, моделей.
- Не путай название бизнеса с ФИО владельца (особенно ИП/самозанятость).
- Все суммы указывать в **рублях**.
- **Финансовый раздел** должен быть математически точным:
  - Общая сумма расходов ≤ стартовая сумма
  - Учёт налогов: УСН 6% или 15%, Патент и др.
  - Чистая прибыль = Доход – Расход – Налоги
  - Если указываешь срок окупаемости — он должен сходиться по расчётам.
  ${personalFormNote}
`;

    let structure = '';

    switch (data.supportType) {
      case "Для социального контракта":
        structure = `
1. Резюме проекта (300–400 слов)
2. Инвестиционный план (400–500 слов)
3. Маркетинговый план (500–600 слов)
4. Производственный план (400–500 слов)
5. Организационный план (400–500 слов)
6. Финансовый план (800–1000 слов)
7. Анализ рисков (400–500 слов)
`;
        break;

      case "Гранта":
        structure = `
1. Резюме проекта (300–400 слов)
2. Описание компании и команды (400–500 слов)
3. Анализ проблемы и потребности (400–500 слов)
4. Описание продукта/услуги (500–600 слов)
5. Анализ рынка и целевой аудитории (500–600 слов)
6. Маркетинговая стратегия (500–600 слов)
7. План реализации проекта (600–800 слов)
8. Финансовый план (800–1000 слов)
9. Ожидаемые результаты и эффект (400–500 слов)
10. Показатели эффективности и масштабирование (400–500 слов)
`;
        break;

      case "Кредита":
        structure = `
1. Краткое описание проекта (300–400 слов)
2. Сведения о заёмщике (200–300 слов)
3. Цель кредитования (300–400 слов)
4. Описание бизнеса (400–500 слов)
5. Финансовый план (800–1000 слов)
6. График возврата кредита (400–500 слов)
7. Анализ рисков (400–500 слов)
8. Заключение о платёжеспособности (300–400 слов)
`;
        break;

      default:
        structure = `
1. Введение и цели (300–400 слов)
2. Описание бизнеса (400–500 слов)
3. Описание товаров/услуг (400–500 слов)
4. Анализ рынка (400–500 слов)
5. Маркетинговая стратегия (400–500 слов)
6. Организационный план (300–400 слов)
7. Финансовый план (800–1000 слов)
8. Выводы и перспективы (300–400 слов)
`;
    }

    return `
Ты профессиональный бизнес-консультант.

Напиши подробный бизнес-план по следующей структуре:

${structure}

${commonInstructions}

📥 Данные клиента:
${parts.join('\n')}

⚡ Объём текста — не менее **10 полноценных страниц Word** (примерно 4500–6000 слов).
⚡ Каждый раздел должен быть раскрыт и логически завершён.
⚡ Формат пригоден для вставки в Word с заголовками и отступами.
`;
  } catch (err) {
    console.error('❌ Ошибка при генерации промпта:', err.message, err.stack);
    throw err;
  }
};
