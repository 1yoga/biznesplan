const PDFDocument = require('pdfkit')
const path = require('path')

module.exports = function generatePDF(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Подключаем нормальный шрифт
    doc.font(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'))
       .fontSize(12)
       .text(text, {
         width: 450,
         align: 'left'
       })

    doc.end()
  })
}
