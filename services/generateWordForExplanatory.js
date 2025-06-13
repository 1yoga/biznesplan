const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
} = require('docx');

function makeParagraph(text, options = {}) {
    return new Paragraph({
        alignment: options.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
        spacing: { line: 360 },
        indent: { firstLine: options.noIndent ? 0 : 1250 },
        children: [
            new TextRun({
                text,
                font: 'Times New Roman',
                size: 28,
            }),
        ],
    });
}

async function generateWordForExplanatory(data) {
    const {
        organization = '',
        recipient = '',
        position = '',
        fullName = '',
        incidentDate = '',
        description = '',
    } = data;

    const doc = new Document({
        sections: [
            {
                properties: {},
                children: [
                    // Шапка
                    makeParagraph(organization.toUpperCase(), { noIndent: true }),
                    makeParagraph(recipient, { noIndent: true }),
                    makeParagraph(`${position} ${fullName}`, { noIndent: true }),
                    makeParagraph('', { noIndent: true }),

                    // Заголовок
                    makeParagraph('Объяснительная записка', { center: true, noIndent: true }),
                    makeParagraph('', { noIndent: true }),

                    // Основной текст
                    makeParagraph(`Дата инцидента: ${incidentDate}`),
                    makeParagraph(description),

                    // Подпись и дата (вручную)
                    makeParagraph('', { noIndent: true }),
                    makeParagraph('___________________ /Подпись/', { noIndent: true }),
                    makeParagraph('«____» __________ 20___ г.', { noIndent: true }),
                ],
            },
        ],
    });

    return await Packer.toBuffer(doc);
}

module.exports = generateWordForExplanatory;
