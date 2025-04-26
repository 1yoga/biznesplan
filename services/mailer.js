const nodemailer = require('nodemailer');

module.exports = async function sendMail(buffer, email) {
  console.log('📨 Инициализация отправки письма...');

  try {
    const transporter = nodemailer.createTransport({
      host:  process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Ваш бизнес-план готов',
      text: 'Во вложении PDF с вашим бизнес-планом.',
      attachments: [
        {
          filename: 'business-plan.pdf',
          content: buffer
        }
      ]
    });

    console.log('📧 Письмо отправлено:', info.messageId);
  } catch (error) {
    console.error('❌ Ошибка при отправке письма:');
    console.error('🔎 Код:', error.code || 'без кода');
    console.error('📄 Сообщение:', error.message);
    console.error('📚 Полная ошибка:', error);
    throw new Error('Не удалось отправить письмо. Подробнее смотри в консоли.');
  }
};
