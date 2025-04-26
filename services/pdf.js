const PDFDocument = require('pdfkit');
const path = require('path');

module.exports = function generatePDF(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Нормальный шрифт
    doc.font(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'))
       .fontSize(12);

    // Разбиваем текст на параграфы
    const paragraphs = text.split(/\n\s*\n/);

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();

      if (paragraph) {
        doc.text(paragraph, {
          width: 450,
          align: 'justify',
          lineGap: 4
        });
        doc.moveDown(); // Отступ между абзацами

        // Опционально: если текст слишком длинный — вручную добавить страницу
        if (doc.y > 700) { // Если текст ушёл ниже 700 по высоте страницы
          doc.addPage();
        }
      }
    }

    doc.end();
  });
}
