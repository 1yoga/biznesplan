const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  TableOfContents,
  HeadingLevel,
  AlignmentType,
} = require("docx");

module.exports = async function generateWord(text, sectionLimit = null) {
  const paragraphs = processTextToParagraphs(text, sectionLimit);

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
    new Paragraph({ children: [new TextRun({ text: '', size: 1 })], spacing: { line: 5000 } }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1000 },
      children: [
        new TextRun({ text: 'БИЗНЕС-ПЛАН', bold: true, size: 48 }),
      ],
    }),

    // Нижняя часть страницы
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 3000, after: 100 },
      children: [new TextRun({ text: 'Инициатор проекта: _______________________', size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Адрес места регистрации: _______________________', size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
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


function processTextToParagraphs(text, sectionLimit = null) {
  const paragraphs = [];
  const lines = text.split("\n");
  let sectionCount = 0;
  let stopProcessing = false;

  for (const line of lines) {
    if (stopProcessing) break;

    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: "", spacing: { line: 276 } }));
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      sectionCount++;
      if (sectionLimit && sectionCount > sectionLimit) {
        stopProcessing = true;
        break;
      }
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
      const lineText = trimmed.slice(2).trim();
      const boldTitleMatch = lineText.match(/^\*\*(.+?)\*\*:$/);

      if (boldTitleMatch) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${boldTitleMatch[1]}:`, bold: true, size: 28 }),
            ],
            spacing: { line: 276 },
            indent: { firstLine: 709 },
          })
        );
      } else {
        const children = [];
        const regex = /\*\*(.+?)\*\*/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(lineText)) !== null) {
          if (match.index > lastIndex) {
            children.push(new TextRun({ text: lineText.slice(lastIndex, match.index), size: 28 }));
          }
          children.push(new TextRun({ text: match[1], bold: true, size: 28 }));
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < lineText.length) {
          children.push(new TextRun({ text: lineText.slice(lastIndex), size: 28 }));
        }

        paragraphs.push(
          new Paragraph({
            children: children.length > 0 ? children : [new TextRun({ text: lineText, size: 28 })],
            bullet: { level: 0 },
            spacing: { line: 276 },
          })
        );
      }
    } else if (/^(\d+)\.\s+(.*)/.test(trimmed)) {
          const [, num, content] = trimmed.match(/^(\d+)\.\s+(.*)/);

          const parts = [];
          const regex = /\*\*(.+?)\*\*/g;
          let lastIndex = 0;
          let match;

          while ((match = regex.exec(content)) !== null) {
            if (match.index > lastIndex) {
              parts.push(new TextRun({ text: content.slice(lastIndex, match.index), size: 28 }));
            }
            parts.push(new TextRun({ text: match[1], bold: true, size: 28 }));
            lastIndex = regex.lastIndex;
          }

          if (lastIndex < content.length) {
            parts.push(new TextRun({ text: content.slice(lastIndex), size: 28 }));
          }

          paragraphs.push(
            new Paragraph({
              children: parts,
              numbering: { reference: "numbered-list", level: 0 },
              spacing: { line: 276 },
            })
          );
        } else {
      const parts = [];
      const regex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;
      let match;

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

