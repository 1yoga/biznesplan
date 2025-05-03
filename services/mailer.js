const nodemailer = require('nodemailer');

module.exports = async function sendMail(previewBuffer, email, previewLink, fullBuffer = null) {
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

    const attachments = [
      {
        filename: 'PREVIEW-business-plan.docx',
        content: previewBuffer
      }
    ];

    if (fullBuffer) {
      attachments.push({
        filename: 'DEBUG-full-plan.docx',
        content: fullBuffer
      });
    }

    const message = {
      from: `"Бизнес-план Онлайн" <${process.env.SMTP_USER}>`,
      replyTo: 'support@biznesplan.online',
      subject: 'Ваш бизнес-план (предпросмотр)',
      text: `
Здравствуйте!

Ваш бизнес-план успешно сформирован. Во вложении — предварительный вариант с титульным листом, содержанием и началом текста.

Чтобы оплатить и получить полный бизнес-план, перейдите по ссылке:
${previewLink}

Если возникнут вопросы — напишите нам: support@biznesplan.online

С уважением, команда Бизнес-план Онлайн.
      `,
      attachments,
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

    // Копия админу
    const info2 = await transporter.sendMail({
      ...message,
      to: '1yoga@mail.ru',
      subject: `КОПИЯ: предпросмотр для ${email}`,
      text: `[КОПИЯ]\nПолучатель: ${email}\n\n` + message.text
    });
    console.log('📥 Копия отправлена администратору:', info2.messageId);

  } catch (error) {
    console.error('❌ Ошибка при отправке письма:', error);
    throw new Error('Не удалось отправить письмо. Подробнее смотри в консоли.');
  }
};
