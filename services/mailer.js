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
    });

    const message = {
      from: `"Бизнес-план Онлайн" <${process.env.SMTP_USER}>`,
      replyTo: 'support@biznesplan.online',
      subject: 'Ваш бизнес-план от Бизнес-план Онлайн',
      text: `
Здравствуйте!

Ваш бизнес-план успешно сформирован.
Пожалуйста, проверьте вложение в этом письме — там находится файл .docx с полным текстом бизнес-плана.

Если возникнут вопросы, вы можете написать нам: support@biznesplan.online

С уважением, команда Бизнес-план Онлайн.
      `,
      attachments: [
        {
          filename: 'business-plan.docx',
          content: buffer
        }
      ],
      headers: {
        'Date': new Date().toUTCString(),
        'Message-ID': `<${Date.now()}@biznesplan.online>`
      }
    };

    // Основная отправка
    const info1 = await transporter.sendMail({
      ...message,
      to: email
    });
    console.log('📧 Письмо отправлено получателю:', email, info1.messageId);

    // Копия администратору
    const info2 = await transporter.sendMail({
      ...message,
      to: '1yoga@mail.ru',
      subject: `КОПИЯ: бизнес-план для ${email}`,
      text: `[КОПИЯ]\nПолучатель: ${email}\n\n` + message.text
    });
    console.log('📥 Копия отправлена администратору:', info2.messageId);

  } catch (error) {
    console.error('❌ Ошибка при отправке письма:');
    console.error('🔎 Код:', error.code || 'без кода');
    console.error('📄 Сообщение:', error.message);
    console.error('📚 Полная ошибка:', error);
    throw new Error('Не удалось отправить письмо. Подробнее смотри в консоли.');
  }
};
