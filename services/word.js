const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  TableOfContents,
  HeadingLevel,
  AlignmentType,
} = require("docx");

module.exports = async function generateWord(text) {
  const paragraphs = processTextToParagraphs(text);

  const doc = new Document({
    features: { updateFields: true },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 1134, right: 720 },
          },
        },
        children: [
          ...generateTitlePage(),

          new Paragraph({ pageBreakBefore: true }),

          new Paragraph({
            text: "Содержание",
            heading: HeadingLevel.HEADING_1,
          }),
          new TableOfContents("Оглавление", {
            hyperlink: true,
            headingStyleRange: "1-3",
          }),

          ...paragraphs,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
};

function generateTitlePage() {
  return [
    new Paragraph({ text: '', spacing: { line: 276 } }),
    new Paragraph({ text: '', spacing: { line: 276 } }),
    new Paragraph({ text: '', spacing: { line: 276 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [
        new TextRun({ text: 'БИЗНЕС-ПЛАН', bold: true, size: 48 }),
      ],
    }),
    new Paragraph({ text: '', spacing: { line: 1000 } }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Инициатор проекта: _______________________', size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: 'Контактный телефон: _______________________', size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 300 },
      children: [new TextRun({ text: 'Адрес электронной почты: ________________', size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 500 },
      children: [new TextRun({ text: '[Город], 2025 г.', size: 28 })],
    }),
  ];
}

function processTextToParagraphs(text) {
  const paragraphs = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: "", spacing: { line: 276 } }));
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^#\s+/, ""),
          heading: HeadingLevel.HEADING_1,
          spacing: { line: 276 },
          pageBreakBefore: true,
        })
      );
    } else if (/^##\s+/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^##\s+/, ""),
          heading: HeadingLevel.HEADING_2,
          spacing: { line: 276 },
        })
      );
    } else if (/^###\s+/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^###\s+/, ""),
          heading: HeadingLevel.HEADING_3,
          spacing: { line: 276 },
        })
      );
    } else if (/^\*\*([^*]+)\*\*:(.+)/.test(trimmed)) {
      const [, boldPart, rest] = trimmed.match(/^\*\*([^*]+)\*\*:(.+)/);
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${boldPart}:`, bold: true, size: 28 }),
            new TextRun({ text: ` ${rest.trim()}`, size: 28 }),
          ],
          bullet: { level: 0 },
          spacing: { line: 276 },
        })
      );
    } else if (/^[•\u25CF\u2022\u2013-]\s+/.test(trimmed)) {
      const textOnly = trimmed.replace(/^[•\u25CF\u2022\u2013-]\s+/, "").replace(/\*\*/g, "");
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: textOnly, size: 28 })],
          bullet: { level: 0 },
          spacing: { line: 276 },
        })
      );
    } else if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: trimmed.replace(/\*\*/g, ""), bold: true, size: 28 }),
          ],
          spacing: { line: 276 },
          indent: { firstLine: 709 },
        })
      );
    } else if (trimmed.startsWith("- ")) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.slice(2), size: 28 })],
          bullet: { level: 0 },
          spacing: { line: 276 },
        })
      );
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

      paragraphs.push(
        new Paragraph({
          children: parts.length > 0 ? parts : [new TextRun({ text: trimmed, size: 28 })],
          spacing: { line: 276 },
          indent: { firstLine: 709 },
        })
      );
    }
  }

  return paragraphs;
}
