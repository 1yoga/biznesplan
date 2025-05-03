const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  TableOfContents,
  HeadingLevel,
} = require('docx');

module.exports = async function generateWord(text) {
  const paragraphs = processTextToParagraphs(text);

  const doc = new Document({
    features: { updateFields: true }, // 💡 Оглавление будет обновлено при открытии
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 1134, right: 720 },
          },
        },
        children: [
          ...generateTitlePage(),

          // 🟦 Новая страница перед содержанием
          new Paragraph({ pageBreakBefore: true }),

          new Paragraph({
            text: 'Содержание',
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
          }),
          new TableOfContents('Оглавление', {
            hyperlink: true,
            headingStyleRange: '1-3',
          }),

          // 🟦 Новая страница перед основным текстом
          new Paragraph({ pageBreakBefore: true }),

          ...paragraphs,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
};

function generateTitlePage() {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: 'Инициатор проекта (ФИО): ________________________', size: 28 }),
      ],
      spacing: { line: 276 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Адрес места регистрации: _______________________', size: 28 }),
      ],
      spacing: { line: 276 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Контактный телефон: ____________________________', size: 28 }),
      ],
      spacing: { line: 276 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Адрес электронной почты: ______________________', size: 28 }),
      ],
      spacing: { line: 276 },
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: '[город/поселение]  [год]', size: 28 }),
      ],
      spacing: { line: 276 },
    }),
  ];
}

function processTextToParagraphs(text) {
  const paragraphs = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '', spacing: { line: 276 } }));
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        text: trimmed.replace(/^#\s+/, ''),
        heading: HeadingLevel.HEADING_1,
        spacing: { line: 276 },
        pageBreakBefore: true, // каждый новый раздел — с новой страницы
      }));
    } else if (/^##\s+/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        text: trimmed.replace(/^##\s+/, ''),
        heading: HeadingLevel.HEADING_2,
        spacing: { line: 276 },
      }));
    } else if (/^###\s+/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        text: trimmed.replace(/^###\s+/, ''),
        heading: HeadingLevel.HEADING_3,
        spacing: { line: 276 },
      }));
    } else if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/\*\*/g, ''), bold: true, size: 28 })],
        spacing: { line: 276 },
        indent: { firstLine: 709 },
      }));
    } else if (trimmed.startsWith('- ')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(2), size: 28 })],
        bullet: { level: 0 },
        spacing: { line: 276 },
      }));
    } else {
      const parts = [];
      let match;
      const regex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;

      while ((match = regex.exec(trimmed)) !== null) {
        if (match.index > lastIndex) {
          parts.push(new TextRun({ text: trimmed.slice(lastIndex, match.index), size: 28 }));
        }
        parts.push(new TextRun({ text: match[1], bold: true, size: 28 }));
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < trimmed.length) {
        parts.push(new TextRun({ text: trimmed.slice(lastIndex), size: 28 }));
      }

      paragraphs.push(new Paragraph({
        children: parts.length > 0 ? parts : [new TextRun({ text: trimmed, size: 28 })],
        spacing: { line: 276 },
        indent: { firstLine: 709 },
      }));
    }
  }

  return paragraphs;
}
