import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { database } from "@ai-office/database";
import { decryptMailboxPassword } from "./mailbox-service.js";

const MAX_MESSAGES_PER_MAILBOX = 50;

// URL corretto per produzione
function productionUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return "https://ai-office-manager-psi.vercel.app";
}

// Processa una singola email
async function processMessage(mailbox: { email: string }, source: Buffer) {
  const parsed = await simpleParser(source);

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
      text: parsed.text?.trim() || "(Messaggio senza contenuto testuale)"
    })
  });

  if (!response.ok) {
    throw new Error(
      `Elaborazione email fallita (${response.status}): ${await response.text()}`
    );
  }
}

// Polling di una singola mailbox
async function pollMailbox(mailbox: {
  email: string;
  username: string;
  passwordEncrypted: string;
  imapHost: string;
  imapPort: number;
}) {
  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapPort === 993,
    auth: {
      user: mailbox.username,
      pass: decryptMailboxPassword(mailbox.passwordEncrypted)
    },
    logger: false
  });

  let imported = 0;

  try {
    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    try {
      // 🔥 VERSIONE CORRETTA: legge TUTTE le email (ALL)
      const allMessages = await client.search({ all: true }, { uid: true });

      // Limita a MAX_MESSAGES_PER_MAILBOX
      const uids = allMessages.slice(-MAX_MESSAGES_PER_MAILBOX);

      for await (const message of client.fetch(
        uids,
        { uid: true, source: true },
        { uid: true }
      )) {
        if (!message.source) continue;

        await processMessage(mailbox, message.source);

        // Segna come lette
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });

        imported += 1;
      }
    } finally {
      lock.release();
    }
  } finally {
    if (client.usable) await client.logout();
  }

  return imported;
}

// Polling di tutte le mailbox abilitate
export async function pollEnabledMailboxes() {
  const mailboxes = await database.mailbox.findMany({
    where: { enabled: true }
  });

  const results: Array<{
    email: string;
    imported: number;
    error?: string;
  }> = [];

  for (const mailbox of mailboxes) {
    try {
      const imported = await pollMailbox(mailbox);
      results.push({ email: mailbox.email, imported });
    } catch (error) {
      results.push({
        email: mailbox.email,
        imported: 0,
        error: error instanceof Error ? error.message : "Errore IMAP"
      });
    }
  }

  return {
    mailboxes: results.length,
    imported: results.reduce((total, r) => total + r.imported, 0),
    results
  };
}
