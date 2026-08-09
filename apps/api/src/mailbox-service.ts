import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

interface MailboxConnection {
  email: string;
  displayName: string | null;
  username: string;
  passwordEncrypted: string;
  smtpHost: string;
  smtpPort: number;
}

function encryptionKey() {
  const secret = process.env.MAILBOX_ENCRYPTION_KEY ?? process.env.INTERNAL_API_KEY;
  if (!secret) throw new Error("Configurare MAILBOX_ENCRYPTION_KEY");
  return createHash("sha256").update(secret).digest();
}

export function encryptMailboxPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMailboxPassword(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Credenziali casella non valide");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function normalizeMailboxPassword(password: string, hosts: string[]) {
  return hosts.some((host) => host.toLowerCase().endsWith("gmail.com")) ? password.replace(/\s/g, "") : password;
}

function transportFor(mailbox: MailboxConnection) {
  return nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpPort === 465,
    auth: { user: mailbox.username, pass: decryptMailboxPassword(mailbox.passwordEncrypted) }
  });
}

export async function verifyMailbox(mailbox: MailboxConnection) {
  try {
    await transportFor(mailbox).verify();
  } catch (error) {
    const authenticationError = typeof error === "object" && error !== null &&
      (("code" in error && error.code === "EAUTH") || ("responseCode" in error && error.responseCode === 535));
    if (authenticationError) {
      throw Object.assign(new Error("Gmail ha rifiutato l'accesso. Usa l'indirizzo Gmail completo e una password per app di 16 caratteri, non la password normale dell'account."), { statusCode: 400 });
    }
    throw error;
  }
}

export async function sendMailboxEmail(mailbox: MailboxConnection, message: { to: string; subject: string; text: string; inReplyTo?: string; attachments?: Array<{ filename: string; content: Buffer; contentType: string }> }) {
  const result = await transportFor(mailbox).sendMail({
    from: mailbox.displayName ? `"${mailbox.displayName.replaceAll('"', "")}" <${mailbox.email}>` : mailbox.email,
    to: message.to,
    subject: message.subject,
    text: message.text,
    inReplyTo: message.inReplyTo,
    references: message.inReplyTo,
    attachments: message.attachments
  });
  return result.messageId;
}
