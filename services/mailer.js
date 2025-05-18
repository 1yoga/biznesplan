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
  async sendFull(buffersOrSingle, email) {
    console.log('📨 Отправляем бизнес-план клиенту...');

    const buffers = Array.isArray(buffersOrSingle) ? buffersOrSingle : [buffersOrSingle];

    const attachments = buffers.map((buffer, index) => ({
      filename: `Бизнес-план ${index + 1}.docx`,
      content: buffer
    }));

    const text = `
  Здравствуйте!
  
  Спасибо за оплату. Во вложении — ваш${buffers.length > 1 ? 'и' : ''} бизнес-план${buffers.length > 1 ? 'ы' : ''}, подготовленн${buffers.length > 1 ? 'ые' : 'ый'} специально для вас.
  
  Если возникнут вопросы — напишите нам: buznesplan@yandex.com
  
  С уважением, команда Бизнес-план Онлайн.
    `;

    const transporter = createTransporter();

    const message = createMessage({
      to: email,
      subject: 'Ваш бизнес-план',
      text,
      attachments
    });

    const info1 = await transporter.sendMail(message);
    console.log('📧 План(ы) отправлен(ы) получателю:', email, info1.messageId);

    const copy = createMessage({
      to: '1yoga@mail.ru',
      subject: `КОПИЯ: план(ы) для ${email}`,
      text: `[КОПИЯ]\nПолучатель: ${email}\n\n` + text,
      attachments
    });

    const info2 = await transporter.sendMail(copy);
    console.log('📥 Копия плана(ов) отправлена администратору:', info2.messageId);
  },


  async sendToAdminsOnly(buffersArray, userEmail) {
    const transporter = createTransporter();

    const attachments = buffersArray.map((buffer, index) => ({
      filename: `Бизнес-план ${index + 1}.docx`,
      content: buffer
    }));

    const count = buffersArray.length;
    const subject = `📄 ${count} бизнес-план${count > 1 ? 'а' : ''} для ${userEmail}`;
    const text = `Клиент: ${userEmail}\nВ приложении — ${count} бизнес-план${count > 1 ? 'а' : ''}.`;


    for (const adminEmail of ADMIN_EMAILS) {
      const fullMsg = createMessage({
        to: adminEmail,
        subject: subject,
        text: text,
        attachments
      });

      await transporter.sendMail(fullMsg);
      console.log('📤 3 плана отправлены администратору:', adminEmail);
    }
  }
};
