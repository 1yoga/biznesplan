const { Document, Packer, Paragraph, TextRun } = require('docx');

module.exports = async function generateWord(text) {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 1134, right: 720 }, // 2.5 см слева = 1134 twips
          },
        },
        children: processTextToParagraphs(text),
      },
    ],
  });

  return Packer.toBuffer(doc);
};

function processTextToParagraphs(text) {
  const paragraphs = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '', spacing: { line: 276 } }));
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^###\s+/, ''), bold: true, size: 32 })],
          spacing: { line: 276 },
          indent: { firstLine: 709 },
        })
      );
    } else if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/\*\*/g, ''), bold: true, size: 28 })],
          spacing: { line: 276 },
          indent: { firstLine: 709 },
        })
      );
    } else if (trimmed.startsWith('- ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.slice(2), size: 28 })],
          bullet: { level: 0 },
          spacing: { line: 276 },
          indent: { firstLine: 709 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, size: 28 })],
          spacing: { line: 276 },
          indent: { firstLine: 709 },
        })
      );
    }
  }

  return paragraphs;
}

