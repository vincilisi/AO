const nodemailer = require("nodemailer");
const { emailConfig } = require("../config/email.config");

const smtpClient = nodemailer.createTransport(emailConfig.smtp);

export { smtpClient };
module.exports = { smtpClient };
