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
  async sendFull(buffersOrSingle, email, formType = 'plan') {
    console.log('📨 Отправляем документы клиенту...');

    const buffers = Array.isArray(buffersOrSingle) ? buffersOrSingle : [buffersOrSingle];

    const baseName = formType === 'explanatory' ? 'Объяснительная записка' : 'Бизнес-план';

    const attachments = buffers.map((buffer, index) => ({
      filename: `${baseName} ${index + 1}.docx`,
      content: buffer
    }));

    const text = `
Здравствуйте!

Спасибо за оплату. Во вложении — ваш${buffers.length > 1 ? 'и' : ''} ${baseName.toLowerCase()}${buffers.length > 1 ? 'и' : ''}, подготовленн${buffers.length > 1 ? 'ые' : 'ый'} специально для вас.

Если у вас не открывается файл, обновите Word или используйте Google Документы.

Если возникнут вопросы — напишите нам: buznesplan@yandex.com

С уважением, команда Бизнес-план Онлайн.
  `;

    const transporter = createTransporter();

    const message = createMessage({
      to: email,
      subject: `Ваш ${baseName}`,
      text,
      attachments
    });

    const info1 = await transporter.sendMail(message);
    console.log('📧 Документ(ы) отправлены получателю:', email, info1.messageId);

    const adminMessage = createMessage({
      to: '1yoga@mail.ru',
      subject: `${baseName} отправлен клиенту ${email}`,
      text: `
[Уведомление]

Клиенту ${email} отправлен документ типа "${baseName}" (${buffers.length} файл${buffers.length > 1 ? 'а' : ''}) в ${new Date().toLocaleString('ru-RU')}.

Письмо успешно доставлено.
    `.trim()
    });

    const info2 = await transporter.sendMail(adminMessage);
    console.log('📥 Уведомление отправлено администратору:', info2.messageId);
  },

  async sendToAdminsOnly(buffersArray, userEmail) {
    const transporter = createTransporter();

    const attachments = buffersArray.map((buffer, index) => ({
      filename: `Документ ${index + 1}.docx`,
      content: buffer
    }));

    const count = buffersArray.length;
    const subject = `📄 ${count} документ${count > 1 ? 'а' : ''} для ${userEmail}`;
    const text = `Клиент: ${userEmail}\nВ приложении — ${count} документ${count > 1 ? 'а' : ''}.`;


    for (const adminEmail of ADMIN_EMAILS) {
      const fullMsg = createMessage({
        to: adminEmail,
        subject: subject,
        text: text,
        attachments
      });

      await transporter.sendMail(fullMsg);
      console.log('отправлены администратору:', adminEmail);
    }
  }
};
