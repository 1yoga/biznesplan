const nodemailer = require('nodemailer')

module.exports = async function sendMail(buffer) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.MAIL_TO,
    subject: 'Ваш бизнес-план готов',
    text: 'Во вложении PDF с вашим бизнес-планом.',
    attachments: [
      {
        filename: 'business-plan.pdf',
        content: buffer
      }
    ]
  })
}
