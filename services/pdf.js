const PDFDocument = require('pdfkit');
const path = require('path');

module.exports = function generatePDF(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
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
    doc.font(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'))
       .fontSize(12)
       .fillColor('#000000');

    // Титульный лист
    doc.fontSize(20)
       .text('БИЗНЕС-ПЛАН', {
         align: 'center',
         underline: true
       });

    doc.moveDown(2);

    doc.fontSize(16)
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
    doc.fontSize(12);

    const paragraphs = text.split(/\n\s*\n/);

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();

      if (paragraph) {
        // Заголовки (если текст начинается с ### или **)
        if (paragraph.startsWith('###')) {
          doc.moveDown(1);
          doc.fontSize(16)
             .font(path.join(__dirname, 'fonts', 'Roboto-Bold.ttf'))
             .text(paragraph.replace(/^###\s*/, ''), {
               align: 'left'
             });
          doc.moveDown(0.5);
          doc.fontSize(12)
             .font(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'));
        } else if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
          doc.moveDown(1);
          doc.fontSize(14)
             .font(path.join(__dirname, 'fonts', 'Roboto-Bold.ttf'))
             .text(paragraph.replace(/\*\*/g, ''), {
               align: 'left'
             });
          doc.moveDown(0.5);
          doc.fontSize(12)
             .font(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'));
        } else {
          // Обычный параграф
          doc.text(paragraph, {
            width: 450,
            align: 'justify',
            lineGap: 6
          });
          doc.moveDown();
        }

        // Перенос на новую страницу, если текст ушёл слишком низко
        if (doc.y > 700) {
          doc.addPage();
        }
      }
    }

    // Нумерация страниц
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Страница ${i + 1} из ${range.count}`, 50, 780, {
           align: 'center',
           width: 500
         });
    }

    doc.end();
  });
}
