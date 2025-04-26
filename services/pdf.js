const PDFDocument = require('pdfkit')

module.exports = function generatePDF(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks = []

    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.font('Times-Roman').fontSize(12).text(text, {
      width: 450,
      align: 'left'
    })
    doc.end()
  })
}
