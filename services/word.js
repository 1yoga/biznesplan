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

    // Заголовки
    if (/^#\s+/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/^#\s+/, ''), bold: true, size: 48 })],
        spacing: { line: 276 },
      }));
    } else if (/^##\s+/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/^##\s+/, ''), bold: true, size: 36 })],
        spacing: { line: 276 },
      }));
    } else if (/^###\s+/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/^###\s+/, ''), bold: true, size: 32 })],
        spacing: { line: 276 },
        indent: { firstLine: 709 },
      }));
    }

    // Жирный текст (подзаголовок)
    else if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/\*\*/g, ''), bold: true, size: 28 })],
        spacing: { line: 276 },
        indent: { firstLine: 709 },
      }));
    }

    // Список
    else if (trimmed.startsWith('- ')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(2), size: 28 })],
        bullet: { level: 0 },
        spacing: { line: 276 },
      }));
    }

    // Простой абзац
    else {
      // Найдём жирные участки внутри текста — например, "Это **важно**!"
      const parts = [];
      let match;
      let regex = /\*\*(.+?)\*\*/g;
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


