const PDFDocument = require('pdfkit');
const path = require('path');

module.exports = function generatePDF(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      info: {
        Title: 'Бизнес-план',
        Author: 'Бизнес-план.онлайн',
      }
    });

    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Нормальный шрифт
    const regularFont = path.join(__dirname, 'fonts', 'Roboto-Regular.ttf');
    const boldFont = path.join(__dirname, 'fonts', 'Roboto-Bold.ttf');

    doc.font(regularFont)
       .fontSize(12)
       .fillColor('#000000');

    // Титульный лист
    doc.fontSize(24)
       .font(boldFont)
       .text('БИЗНЕС-ПЛАН', {
         align: 'center',
         underline: true
       });

    doc.moveDown(2);

    doc.fontSize(16)
       .font(regularFont)
       .text('Подается для получения финансовой поддержки', {
         align: 'center'
       });

    doc.moveDown(10);

    const date = new Date();
    const formattedDate = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth()+1).toString().padStart(2, '0')}.${date.getFullYear()}`;

    doc.fontSize(14)
       .text(`Дата подготовки: ${formattedDate}`, {
         align: 'center'
       });

    doc.addPage(); // Новый лист после титула

    // Тело бизнес-плана
    const paragraphs = text.split(/\n\s*\n/);

    paragraphs.forEach((paragraph) => {
      const trimmed = paragraph.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('###')) {
        // Большие заголовки
        doc.moveDown(1);
        doc.font(boldFont)
           .fontSize(18)
           .text(trimmed.replace(/^###\s*/, ''), {
             align: 'left'
           });
        doc.moveDown(0.5);
        doc.font(regularFont)
           .fontSize(12);
      } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        // Подзаголовки
        doc.moveDown(1);
        doc.font(boldFont)
           .fontSize(14)
           .text(trimmed.replace(/\*\*/g, ''), {
             align: 'left'
           });
        doc.moveDown(0.5);
        doc.font(regularFont)
           .fontSize(12);
      } else {
        // Обычный параграф
        doc.font(regularFont)
           .fontSize(12)
           .text(trimmed, {
             width: 450,
             align: 'justify',
             lineGap: 6
           });
        doc.moveDown(1);
      }

      if (doc.y > 700) {
        doc.addPage();
      }
    });

    const pageRange = doc.bufferedPageRange(); // { start: 0, count: X }

    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Страница ${i + 1} из ${pageRange.count}`, 50, 780, {
           align: 'center',
           width: 500
         });
    }

    doc.end();
  });
}
