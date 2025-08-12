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

// ===== ВСПОМОГАТЕЛЬНЫЕ =====

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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
        '  </style>',
        '  <!--[if gte mso 9]><xml><w:WordDocument>',
        '    <w:View>Print</w:View><w:Zoom>100</w:Zoom><w:Compatibility/>',
        '  </w:WordDocument></xml><![endif]-->',
        '</head>',
        '<body>'
    ].join('\n');

    const FOOT = '\n</body>\n</html>';

    const lines = String(text).split('\n');

    const isH1 = (s) => /^\s*договор\b/i.test(s);
    const isH2 = (s) =>
        /^\s*\d+\.\s*[А-ЯA-ZЁ][^]*$/.test(s.trim()) ||
        /^\s*предмет договора\b/i.test(s) ||
        /^\s*права и обязанности сторон\b/i.test(s) ||
        /цена\b|порядок расч[её]тов/i.test(s) ||
        /срок действия|расторж/i.test(s) ||
        /порядок (приемк|передач)/i.test(s) ||
        /конфиденциал/i.test(s) ||
        /права на результ/i.test(s) ||
        /ответственность|неустойк/i.test(s) ||
        /форс-?мажор/i.test(s) ||
        /разрешение споров|подсудност/i.test(s) ||
        /прочие условия/i.test(s) ||
        /реквизиты и подписи сторон/i.test(s) ||
        /приложени[ея]/i.test(s);

    // Сгруппируем последовательности маркеров в <ul>
    const isBullet = (s) => /^\s*(—|-|•)\s+/.test(s);

    let i = 0;
    const out = [];

    while (i < lines.length) {
        let raw = lines[i] || '';
        const line = raw.replace(/\s+$/g, '');

        // Пустая строка -> просто разрыв абзаца
        if (!line.trim()) {
            out.push('<p>&nbsp;</p>');
            i++;
            continue;
        }

        // Заголовок H1 (первое "ДОГОВОР ...")
        if (isH1(line)) {
            out.push(`<h1>${escapeHtml(line)}</h1>`);
            i++;
            continue;
        }

        // Заголовки H2 (разделы)
        if (isH2(line)) {
            out.push(`<h2>${escapeHtml(line)}</h2>`);
            i++;
            continue;
        }

        // Список (маркированные пункты подряд)
        if (isBullet(line)) {
            const items = [];
            while (i < lines.length && isBullet(lines[i] || '')) {
                const liText = String(lines[i]).replace(/^\s*(—|-|•)\s+/, '');
                items.push(`<li>${escapeHtml(liText)}</li>`);
                i++;
            }
            out.push(`<ul>${items.join('')}</ul>`);
            continue;
        }

        // Обычный абзац
        out.push(`<p>${escapeHtml(line)}</p>`);
        i++;
    }

    return HEAD + '\n' + out.join('\n') + FOOT;
}

module.exports = generateWordForContract;
