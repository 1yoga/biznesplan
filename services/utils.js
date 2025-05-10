const ADMIN_EMAILS = (process.env.MAIL_TO || '')
  .split(',')
  .map(email => email.trim())
  .filter(Boolean);

module.exports = { ADMIN_EMAILS };