const nodemailer = require('nodemailer');
const {ADMIN_EMAILS} = require("./utils");

function createTransporter() {
  return nodemailer.createTransport({
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
}

function createMessage({ to, subject, text, attachments }) {
  return {
    from: `"Бизнес-план Онлайн" <${process.env.SMTP_USER}>`,
    replyTo: 'buznesplan@yandex.com',
    subject,
    text,
    to,
    attachments,
    headers: {
      'Date': new Date().toUTCString(),
      'Message-ID': `<${Date.now()}@biznesplan.online>`
    }
  };
}

module.exports = {
  async sendPreview(previewBuffer, email, previewLink, fullBuffer) {
    const transporter = createTransporter();

    /*const previewMessage = createMessage({
      to: email,
      subject: 'Ваш бизнес-план (предпросмотр)',
      text: `
  Здравствуйте!
  
  Ваш бизнес-план успешно сформирован. Во вложении — предварительный вариант с титульным листом, содержанием и началом текста.
  
  Чтобы оплатить и получить полный бизнес-план, перейдите по ссылке:
  ${previewLink}
  
  Если возникнут вопросы — напишите нам: buznesplan@yandex.com
  
  С уважением, команда Бизнес-план Онлайн.
      `,
      attachments: [{
        filename: 'PREVIEW-business-plan.docx',
        content: previewBuffer
      }]
    });

    await transporter.sendMail(previewMessage);*/
    if (fullBuffer) {
      for (const adminEmail of ADMIN_EMAILS) {
        const fullMsg = createMessage({
          to: adminEmail,
          subject: `план для ${email}`,
          text: `Адрес клиента: ${email}`,
          attachments: [{
            filename: 'FULL-business-plan.docx',
            content: fullBuffer
          }]
        });

        await transporter.sendMail(fullMsg);
        console.log('📤 план отправлен администратору:', adminEmail);
      }
    }
  },

  async sendFull(fullBuffer, email) {
    console.log('📨 Отправляем бизнес-план...');
    const transporter = createTransporter();

    const attachments = [
      {
        filename: 'FULL-business-plan.docx',
        content: fullBuffer
      }
    ];

    const text = `
Здравствуйте!

Спасибо за оплату. Во вложении — бизнес-план, подготовленный специально для вас.

Если возникнут вопросы — напишите нам: buznesplan@yandex.com

С уважением, команда Бизнес-план Онлайн.
    `;

    const message = createMessage({
      to: email,
      subject: 'Ваш бизнес-план',
      text,
      attachments
    });

    const info1 = await transporter.sendMail(message);
    console.log('📧 План отправлен получателю:', email, info1.messageId);

    const copy = createMessage({
      to: '1yoga@mail.ru',
      subject: `КОПИЯ: план для ${email}`,
      text: `[КОПИЯ]\nПолучатель: ${email}\n\n` + text,
      attachments
    });

    const info2 = await transporter.sendMail(copy);
    console.log('📥 Копия плана отправлена администратору:', info2.messageId);
  },

  async sendToAdminsOnly(fullBuffer, userEmail) {
    const transporter = createTransporter();

    for (const adminEmail of ADMIN_EMAILS) {
      const fullMsg = createMessage({
        to: adminEmail,
        subject: `план для ${userEmail}`,
        text: `Адрес клиента: ${userEmail}`,
        attachments: [{
          filename: 'FULL-business-plan.docx',
          content: fullBuffer
        }]
      });

      await transporter.sendMail(fullMsg);
      console.log('📤 план отправлен администратору:', adminEmail);
    }
  }
};
