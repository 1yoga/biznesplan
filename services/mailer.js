const nodemailer = require('nodemailer');

module.exports = async function sendMail(buffer, email) {
  console.log('📨 Инициализация отправки письма...');

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      logger: true,
      debug: true
    });

    const info = await transporter.sendMail({
      from: `"Бизнес-план Онлайн" <${process.env.SMTP_USER}>`,
      replyTo: 'support@biznesplan.online',
      to: email,
      subject: 'Ваш бизнес-план от Бизнес-план Онлайн',
      text: `
    Здравствуйте!
    
    Ваш бизнес-план успешно сформирован.
    Пожалуйста, проверьте вложение в этом письме — там находится PDF-файл с полным текстом бизнес-плана.
    
    Если возникнут вопросы, вы можете написать нам: support@biznesplan.online
    
    С уважением,
    команда Бизнес-план Онлайн.
      `,
      attachments: [
        {
          filename: 'business-plan.pdf',
          content: buffer
        }
      ],
      headers: {
        'Date': new Date().toUTCString(),
        'Message-ID': `<${Date.now()}@biznesplan.online>`
      }
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
