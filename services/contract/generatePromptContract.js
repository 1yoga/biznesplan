module.exports = function generatePromptContract(data) {
    try {
        if (!data || typeof data !== 'object') {
            throw new Error('Нет данных формы для генерации промпта');
        }

        // ==== Вспомогательные функции ====
        const clean = (v) => {
            if (v === null || v === undefined) return '';
            return String(v).replace(/\s+/g, ' ').trim();
        };
        const cleanMultiline = (v) => {
            if (!v) return '';
            return String(v)
                .split('\n')
                .map((x) => x.replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .join('\n');
        };
        const has = (v) => clean(v).length > 0;

        const line = (label, value) =>
            `${label}: ${has(value) ? clean(value) : '___'}`;

        const block = (label, value) =>
            `${label}:\n${has(value) ? cleanMultiline(value) : '___'}`;

        const pickType = (d) => {
            const custom = clean(d.custom_contract_type);
            if (custom) return custom;
            const std = clean(d.contract_type);
            return std || '___';
        };

        const rolesToParties = (yourRole) => {
            const r = clean(yourRole).toLowerCase();
            const map = {
                'продавец': ['Продавец', 'Покупатель'],
                'покупатель': ['Покупатель', 'Продавец'],
                'арендодатель': ['Арендодатель', 'Арендатор'],
                'арендатор': ['Арендатор', 'Арендодатель'],
                'заказчик': ['Заказчик', 'Исполнитель'],
                'исполнитель': ['Исполнитель', 'Заказчик'],
                'займодавец': ['Займодавец', 'Заемщик'],
                'заемщик': ['Заемщик', 'Займодавец'],
                'даритель': ['Даритель', 'Одаряемый'],
                'одаряемый': ['Одаряемый', 'Даритель'],
                'участник 1': ['Участник 1', 'Участник 2'],
                'участник 2': ['Участник 2', 'Участник 1'],
            };
            for (const key of Object.keys(map)) {
                if (r.includes(key)) {
                    const [p1, p2] = map[key];
                    return { party1Title: p1, party2Title: p2 };
                }
            }
            return { party1Title: 'Сторона 1', party2Title: 'Сторона 2' };
        };

        const normalizeDuration = (d) => {
            const base = clean(d.duration);
            const details = clean(d.duration_details || d.duration_text || d.duration_extra);
            if (!base && !details) return '___';
            if (/бессроч/i.test(base)) {
                return 'Бессрочный договор. Каждая сторона вправе расторгнуть договор с письменным уведомлением за 30 календарных дней.';
            }
            if (/указани/i.test(base) || details) {
                return details || base || '___';
            }
            return base || '___';
        };

        const normalizePayment = (d) => {
            const base = clean(d.payment_terms);
            const details = cleanMultiline(d.payment_terms_details);
            if (!base && !details) return '___';
            if (/част/i.test(base)) {
                if (details) return `Оплата по этапам: ${details}`;
                // иногда Tilda может склеить текст этапов в одно поле
                const fromBase = base.split(/[:—-]/).slice(1).join(' ').trim();
                return fromBase ? `Оплата по этапам: ${fromBase}` : 'Оплата частями (этапы: ___).';
            }
            if (/предоплат/i.test(base)) return 'Предоплата.';
            if (/постоплат/i.test(base)) return 'Постоплата.';
            return base || '___';
        };

        const detectHintsByType = (type) => {
            const t = clean(type).toLowerCase();
            const hints = [];
            if (t.includes('купля-продажа авто') || t.includes('мото')) {
                hints.push('Добавь условия: переход права собственности на ТС, состояние ТС, отсутствие обременений, ПТС/СТС, передача ключей и документов, регистрация в ГИБДД.');
            }
            if (t.includes('купля-продажа') && !t.includes('авто') && !t.includes('мото') && !t.includes('недвиж')) {
                hints.push('Для движимого имущества: комплектность, качество, момент перехода риска, правила приемки.');
            }
            if (t.includes('недвиж')) {
                hints.push('Недвижимость: точное описание объекта (адрес, кадастровый номер), передаточный акт, порядок расчётов, госрегистрация перехода права, коммунальные платежи до/после передачи.');
            }
            if (t.includes('дарение')) {
                hints.push('Дарение: безвозмездность, предмет дарения, отсутствие обременений, при необходимости согласия.');
            }
            if (t.includes('аренда') && (t.includes('жиль') || t.includes('квартира') || t.includes('дом'))) {
                hints.push('Аренда жилья: правила пользования, залог/депозит, коммунальные платежи, порядок расторжения и возврата.');
            }
            if (t.includes('аренда') && (t.includes('коммерчес') || t.includes('офис') || t.includes('склад'))) {
                hints.push('Аренда коммерческая: назначение, эксплуатация, ремонт/улучшения, ответственность, субаренда (по согласованию).');
            }
            if (t.includes('аренда') && (t.includes('транспорт') || t.includes('авто') || t.includes('спецтех'))) {
                hints.push('Аренда ТС: эксплуатация, ГСМ/ТО, штрафы/ДТП, лимиты пробега/времени, передаточный акт.');
            }
            if (t.includes('подряд') || t.includes('строитель') || t.includes('ремонт')) {
                hints.push('Подряд: ТЗ/смета, этапы и сроки, гарантия, порядок приемки, неустойки за просрочку.');
            }
            if (t.includes('услуги') || t.includes('b2b') || t.includes('it')) {
                hints.push('Услуги/IT/B2B: SLA/метрики качества, конфиденциальность, права на результаты (передача/лицензия), отчетность.');
            }
            if (t.includes('поставка')) {
                hints.push('Поставка: номенклатура и график, тара/упаковка, приемка по количеству и качеству, INCOTERMS при необходимости.');
            }
            if (t.includes('агентск')) {
                hints.push('Агентский: предмет поручения, вознаграждение (процент/фикс), отчет агента, компенсация расходов, запрет конкуренции (опционально).');
            }
            if (t.includes('комисси')) {
                hints.push('Комиссия: предмет комиссии, вознаграждение, отчет комиссионера, ответственность за выбор контрагентов.');
            }
            if (t.includes('займ') || t.includes('кредит')) {
                hints.push('Заем: сумма, срок, проценты/беспроцентно, график возврата, неустойка, досрочное погашение, расписка.');
            }
            if (t.includes('совместной деятель')) {
                hints.push('Совместная деятельность: вклады участников, распределение прибыли/убытков, управление, учет, выход участника.');
            }
            if (t.includes('авторск') || t.includes('фото') || t.includes('дизайн') || t.includes('тексты')) {
                hints.push('Авторский: передача/лицензия на исключительные права, территория, срок, способы использования, вознаграждение, моральные права.');
            }
            if (t.includes('хранен')) {
                hints.push('Хранение: предмет, условия безопасности, вознаграждение, ответственность хранителя, сроки и порядок возврата.');
            }
            return hints;
        };

        // ==== Сбор данных ====
        const type = pickType(data);
        const yourRole = clean(data.your_role);
        const { party1Title, party2Title } = rolesToParties(yourRole);

        const durationText = normalizeDuration(data);
        const paymentText = normalizePayment(data);
        const amountText = has(data.contract_amount) ? clean(data.contract_amount) : '___';

        const parts = [];

        // Ключевые поля
        parts.push(line('Тип договора', type));
        parts.push(line('Роль инициатора', yourRole || '___'));
        parts.push('');
        parts.push(block(`Сторона 1 (${party1Title})`, data.your_info));
        parts.push('');
        parts.push(block(`Сторона 2 (${party2Title})`, data.counterparty_info));
        parts.push('');
        parts.push(block('Предмет / описание', data.contract_description));
        parts.push('');
        parts.push(line('Срок действия', durationText));
        parts.push(line('Цена / сумма по договору', amountText));
        parts.push(line('Порядок оплаты', paymentText));
        parts.push('');
        parts.push(line('Email', data.email));
        parts.push(line('Телефон', data.phone));

        // Доп. указания
        const hints = detectHintsByType(type);
        const extra = [
            '1) Сформируй ПОЛНЫЙ юридически корректный текст договора по праву РФ на русском языке.',
            '2) Не используй Markdown и не добавляй комментарии — только текст договора.',
            '3) Придерживайся стандартной структуры разделов и единой терминологии.',
            '4) Суммы, если указаны, продублируй цифрами и прописью.',
            '5) Для юрлиц добавь реквизиты, для физлиц — паспортные/адресные данные, если они предоставлены.',
            '6) В конце договора — реквизиты сторон и блок подписей с местом и датой.',
            '7) Не придумывай отсутствующие паспортные данные, ИНН/ОГРН, VIN, адреса — оставляй "___".',
            '8) Контакты используются только для связи и не включаются в реквизиты, если это неуместно.',
            '',
            'Рекомендуемая структура:',
            '— Предмет договора',
            '— Права и обязанности сторон',
            '— Цена и порядок расчетов',
            '— Срок действия и порядок расторжения',
            '— Ответственность сторон и неустойка',
            '— Порядок приемки (если применимо)',
            '— Конфиденциальность (если применимо)',
            '— Права на результаты работ/интеллектуальной деятельности (если применимо)',
            '— Форс-мажор',
            '— Разрешение споров (подсудность в РФ)',
            '— Заключительные положения',
            '— Реквизиты и подписи сторон',
            '— Приложения (смета/ТЗ/график/спецификация — при наличии)',
            '',
            'Юридический контекст по типу договора:',
            ...(hints.length ? hints.map((h, i) => `${i + 1}. ${h}`) : ['Стандартные условия для данного типа договора.']),
        ].join('\n');

        // ==== Возврат промпта ====
        return `Ты — опытный юрист по договорному праву РФ. Подготовь итоговый договор в виде чистого текста, пригодного для печати и сохранения в DOC/PDF.

Используй следующие данные:  

----- 

📥 Данные от заказчика:
${parts.join('\n')}
----- 

Дополнительные указания:
${extra}
`;
    } catch (err) {
        console.error('❌ Ошибка при генерации промпта:', err.message, err.stack);
        throw err;
    }
};
