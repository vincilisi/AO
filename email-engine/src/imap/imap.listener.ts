import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decryptMailboxPassword } from "../mailbox/mailbox.service";
import { logger } from "../utils/logger";
import { prisma } from "../database/client";

const MAX_MESSAGES_PER_MAILBOX = 50;

function productionUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://ai-office-manager-psi.vercel.app";
}

async function registerEmail(mailbox, parsed) {
  const response = await fetch(`${productionUrl()}/api/emails/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": process.env.INTERNAL_API_KEY ?? ""
    },
    body: JSON.stringify({
      messageId: parsed.messageId,
      from: parsed.from?.text ?? "Mittente sconosciuto",
      to: mailbox.email,
      subject: parsed.subject?.trim() || "(Senza oggetto)",
      text: parsed.text?.trim() || "(Messaggio senza contenuto testuale)",
      mailboxId: mailbox.id,
      direction: "INBOUND",
      status: "RECEIVED",
      receivedAt: new Date()
    })
  });

  if (!response.ok) {
    throw new Error(
      `Elaborazione email fallita (${response.status}): ${await response.text()}`
    );
  }
}

async function pollMailbox(mailbox) {
  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort ?? 993,       // fallback se manca nel DB
    secure: true,                        // Gmail richiede SSL
    auth: {
      user: mailbox.username,
      pass: decryptMailboxPassword(mailbox.passwordEncrypted)
    },
    tls: {
      rejectUnauthorized: false          // evita handshake failure su Render/GitHub
    },
    logger: false,
    imapTimeout: 60000,                  // evita ETIMEOUT
    socketTimeout: 60000
  });

  let imported = 0;

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    try {
      const allMessages = await client.search({ all: true }, { uid: true });

      const uids = allMessages.slice(-MAX_MESSAGES_PER_MAILBOX);

      for await (const message of client.fetch(
        uids,
        { uid: true, source: true },
        { uid: true }
      )) {
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);

        await registerEmail(mailbox, parsed);

        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });

        imported++;
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.error(`Errore IMAP ${mailbox.email}: ${err.message}`);
  } finally {
    if (client.usable) await client.logout();
  }

  return imported;
}

export async function pollEnabledMailboxes() {
  const mailboxes = await prisma.mailbox.findMany({
    where: { enabled: true }
  });

  const results = [];

  for (const mailbox of mailboxes) {
    try {
      const imported = await pollMailbox(mailbox);
      results.push({ email: mailbox.email, imported });
    } catch (err) {
      results.push({
        email: mailbox.email,
        imported: 0,
        error: err.message
      });
    }
  }

  return {
    mailboxes: results.length,
    imported: results.reduce((t, r) => t + r.imported, 0),
    results
  };
}
