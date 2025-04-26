const PDFDocument = require('pdfkit');
const path = require('path');

module.exports = function generatePDF(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 70, bottom: 70, left: 70, right: 70 } // Широкие отступы
    });

    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Подключаем красивый шрифт Roboto
    doc.font(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'))
       .fontSize(12)
       .fillColor('#000000') // Чёрный цвет текста
       .lineGap(6) // Межстрочный интервал
       .text(text, {
         width: 450,
         align: 'justify' // Выравнивание по ширине
       });

    // Добавляем номера страниц
    const range = doc.bufferedPageRange(); // получаем диапазон страниц
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(10)
         .fillColor('gray')
         .text(`Стр. ${i + 1} из ${range.count}`, 0, doc.page.height - 50, {
           align: 'center'
         });
    }

    doc.end();
  });
};
