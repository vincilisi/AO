import { smtpClient } from "../smtp/smtp.client";

export const autoReply = async (to: string, subject: string, message: string) => {
  await smtpClient.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text: message,
  });
};
