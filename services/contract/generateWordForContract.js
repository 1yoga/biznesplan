/**
 * Генерация .doc (Word-совместимый HTML) для договора.
 * @param {object|null} formData - данные формы (может пригодиться для шапки).
 * @param {string} gptText - готовый текст договора от LLM (чистый текст).
 * @param {object} options
 * @param {boolean} [options.injectHeader=false] - форсировать шапку (ДОГОВОР / г. ___ / «__» ______ 20__ г.)
 * @param {string} [options.city='г. ___'] - город в шапке, если injectHeader=true
 * @param {string} [options.date='«__» ______ 20__ г.'] - дата в шапке, если injectHeader=true
 * @returns {Promise<Buffer>} Buffer содержимого .doc
 */
async function generateWordForContract(formData, gptText, options = {}) {
    try {
        // 1) Валидация
        if (typeof gptText !== 'string' || gptText.trim().length === 0) {
            throw new Error('Пустой текст договора (gptText). Нечего конвертировать в DOC.');
        }

        // 2) Препроцессинг текста
        const localPreprocess = (s) => {
            return String(s)
                .replace(/\r\n/g, '\n')
                .replace(/\u00A0/g, ' ')
                .replace(/[ \t]+/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        };
        const doPreprocess = (typeof preprocessText === 'function') ? preprocessText : localPreprocess;
        let text = doPreprocess(gptText);

        // 3) Опциональная инъекция шапки
        const {
            injectHeader = false,
            city = 'г. ___',
            date = '«__» ______ 20__ г.',
        } = options || {};

        if (injectHeader) {
            const hasHeaderAlready =
                /^договор[\s\S]{0,120}\n/i.test(text) ||
                /(^|\n)г\.\s*.+\n.*«\s*__\s*»/i.test(text) ||
                /(^|\n)место заключения:/i.test(text);
            if (!hasHeaderAlready) {
                const type =
                    (formData && typeof formData === 'object'
                        ? String(formData.custom_contract_type || formData.contract_type || '').trim()
                        : '') || '';
                const title = type ? `ДОГОВОР ${type.toUpperCase()}` : 'ДОГОВОР';
                text = [title, city, date, '', text].join('\n');
            }
        }

        // 4) Генерация Word-совместимого HTML (.doc)
        const html = buildWordHtmlFromText(text);
        const buffer = Buffer.from(html, 'utf8');

        // 5) Мини-диагностика
        if (!buffer || buffer.length === 0) {
            console.warn('⚠️ generateWordForcontract: получен пустой Buffer .doc');
        }

        return buffer;
    } catch (e) {
        console.error('❌ Ошибка в generateWordForcontract (.doc):', e?.message, e?.stack);
        throw e;
    }
};

// === ПОДМЕНА/ДОБАВЛЕНИЕ ФУНКЦИЙ ДЛЯ КРАСИВЫХ "ПРОПИСНЫХ ЛИНИЙ" ===

function stripMarkdown(line) {
    let t = String(line);
    t = t.replace(/^\s*#{1,6}\s+/, '');                  // #, ##, ### ...
    t = t.replace(/\*\*(.+?)\*\*/g, '$1')               // **bold**
        .replace(/__(.+?)__/g, '$1')                   // __bold__
        .replace(/\*(.+?)\*/g, '$1')                   // *italic*
        .replace(/_(.+?)_/g, '$1')                     // _italic_
        .replace(/`([^`]+)`/g, '$1');                  // `code`
    t = t.replace(/^\s*[\*\-•]\s+/, '— ');              // списки -> длинное тире
    return t.trimEnd();
}

function normalizeLines(text) {
    return String(text)
        .replace(/\r\n/g, '\n')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n')
        .map((l) => stripMarkdown(l).trimRight());
}

// Экраним спецсимволы перед сборкой общего RegExp
function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Конвертируем плейсхолдеры "_" в подписи/линии нормальной ширины
function renderInlinePlaceholders(s) {
    let out = String(s);

    // 1) Широкие поля: собираем безопасный шаблон из "простых" меток
    const wideLabels = [
        'ФИО', 'Паспорт', 'Адрес', 'ИНН', 'ОГРН', 'КПП', 'Банк', 'БИК',
        'Расчетный счет', 'Р/с', 'К/с', 'Телефон', 'Email'
    ];
    const widePattern = `(?:^|\\s)(${wideLabels.map(escapeRe).join('|')})\\s*:\\s*_+`;
    const wideRe = new RegExp(widePattern, 'giu');
    out = out.replace(wideRe, (_, label) => `${label}: <span class="fill fill-lg">&nbsp;</span>`);

    // 2) Отдельно — «Корр. счет / Корр счет / Корреспондентский счет/счёт»
    // (варианты с точкой/без, ё/е, пробелами)
    out = out.replace(
        /(?:^|\s)((?:Корр(?:\.|)\\s*|Корреспондентский\\s*)сч[её]т)\\s*:\\s*_+/giu,
        (_, label) => `${label}: <span class="fill fill-lg">&nbsp;</span>`
    );

    // 3) Подписи вида "Продавец: __/__/" → две линии (подпись / расшифровка)
    out = out.replace(
        /(Продавец|Покупатель)\s*:\s*__\/__\//giu,
        (_, who) => `${who}: <span class="fill fill-md">&nbsp;</span> / <span class="fill fill-sm">&nbsp;</span> /`
    );

    // 4) Любые группы подчёркиваний -> линия подходящей ширины
    out = out.replace(/_{2,}/g, (u) => {
        const n = u.length;
        const em = Math.max(8, Math.min(40, Math.round(n * 2))); // 1 "_" ~ 2em
        return `<span class="fill" style="min-width:${em}em">&nbsp;</span>`;
    });

    return out;
}

// Нормализуем "шапку" (город/дата) в виде одной чёткой строки
function normalizeHeaderLine(s) {
    const cityDateRe = /^\s*г\.\s*.*$/i;
    if (cityDateRe.test(s)) {
        return 'г. ___    «__» ______ 20__ г.'; // единый аккуратный вид
    }
    // Иногда дата идёт отдельно:
    const onlyDate = /^«[_\s]*»\s*[_\s]+20__\s*г\.\s*$/i;
    if (onlyDate.test(s)) {
        return 'г. ___    «__» ______ 20__ г.';
    }
    return s;
}

// Заголовки/маркировка
const isH1 = (s) => /^\s*договор(\b|\s)/i.test(s.trim());
const isTopNumberedHeading = (s) =>
    /^\s*\d+\.\s+[А-ЯA-ZЁ]/.test(s) && !/^\s*\d+\.\d+\./.test(s);
const isNamedHeading = (s) =>
    /^\s*(предмет договора|права и обязанности сторон|цена и порядок расч[её]тов|срок действия|порядок расторжения|порядок (приемк|передач)и|конфиденциал|права на результ|ответственность|форс-?мажор|разрешение споров|прочие условия|заключительные положения|реквизиты и подписи сторон|приложени[ея])\b/i
        .test(s);
const isH2 = (s) => isTopNumberedHeading(s) || isNamedHeading(s);
const isHeaderRightAligned = (s) =>
    /^\s*г\.\s*.+(?:«.+»\s*\d{2,4}\s*г\.)?$/i.test(s) || /^«__»\s*______\s*20__\s*г\.\s*$/i.test(s);
const isBullet = (s) => /^\s*(—|-|•|\*)\s+/.test(s);

// === ОБНОВЛЁННЫЙ РЕНДЕР В WORD-HTML (.doc) ===
function buildWordHtmlFromText(text) {
    const HEAD = [
        '<!DOCTYPE html>',
        '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
        '      xmlns:w="urn:schemas-microsoft-com:office:word"',
        '      xmlns="http://www.w3.org/TR/REC-html40">',
        '<head>',
        '  <meta charset="utf-8">',
        '  <title>Договор</title>',
        '  <style>',
        '    @page { size: A4; margin: 2cm 2cm 2cm 3cm; }',
        '    body { font-family: "Times New Roman"; font-size: 12pt; line-height: 1.15; }',
        '    h1 { text-align: center; font-weight: bold; text-transform: uppercase; margin: 0 0 12pt; }',
        '    h2 { font-weight: bold; margin: 12pt 0 6pt; }',
        '    p  { margin: 0 0 8pt; }',
        '    ul { margin: 0 0 8pt 18pt; }',
        '    li { margin: 0 0 4pt; }',
        '    .doc-header { text-align: right; margin-bottom: 12pt; }',
        '    .fill { display:inline-block; border-bottom:1px solid #000; min-width:10em; }',
        '    .fill.fill-xs{ min-width:6em; }',
        '    .fill.fill-sm{ min-width:10em; }',
        '    .fill.fill-md{ min-width:16em; }',
        '    .fill.fill-lg{ min-width:24em; }',
        '    .fill.fill-xl{ min-width:32em; }',
        '  </style>',
        '  <!--[if gte mso 9]><xml><w:WordDocument>',
        '    <w:View>Print</w:View><w:Zoom>100</w:Zoom><w:Compatibility/>',
        '  </w:WordDocument></xml><![endif]-->',
        '</head>',
        '<body>'
    ].join('\n');

    const FOOT = '\n</body>\n</html>';
    const escapeHtml = (str) => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const lines = normalizeLines(text);

    let i = 0;
    const out = [];

    while (i < lines.length) {
        let ln = lines[i] || '';
        ln = normalizeHeaderLine(ln);
        const rawForInline = renderInlinePlaceholders(ln);
        const lnEsc = escapeHtml(rawForInline).replace(/&lt;span class=&quot;fill.*?&lt;\/span&gt;/g, (m) =>
            // Возвращаем теги <span class="fill">, которые ранее экранировали
            m.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
        );

        if (!ln.trim()) {
            out.push('<p>&nbsp;</p>');
            i++; continue;
        }

        if (isH1(ln)) { out.push(`<h1>${lnEsc}</h1>`); i++; continue; }

        if (isHeaderRightAligned(ln)) {
            out.push(`<p class="doc-header">${lnEsc}</p>`); i++; continue;
        }

        if (isH2(ln)) { out.push(`<h2>${lnEsc}</h2>`); i++; continue; }

        if (isBullet(ln)) {
            const items = [];
            while (i < lines.length && isBullet(lines[i] || '')) {
                const liText = renderInlinePlaceholders(String(lines[i]).replace(/^\s*(—|-|•|\*)\s+/, ''));
                const liEsc = escapeHtml(liText).replace(/&lt;span class=&quot;fill.*?&lt;\/span&gt;/g, (m) =>
                    m.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
                );
                items.push(`<li>${liEsc}</li>`);
                i++;
            }
            out.push(`<ul>${items.join('')}</ul>`);
            continue;
        }

        out.push(`<p>${lnEsc}</p>`);
        i++;
    }

    return HEAD + '\n' + out.join('\n') + FOOT;
}


module.exports = generateWordForContract;
