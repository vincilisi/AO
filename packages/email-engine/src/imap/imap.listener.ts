const Imap = require("imap");
const { simpleParser } = require("mailparser");
const { logger } = require("../utils/logger");
const { parseEmail } = require("../parsers/email.parser");

type MailboxConfig = {
  id: string;
  email: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
};

const clients = new Map<string, InstanceType<typeof Imap>>();
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";

async function registerEmail(mailbox: MailboxConfig, parsedMessage: unknown) {
  const email = parseEmail(parsedMessage);
  const response = await fetch(`${apiUrl}/api/emails/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY ?? "" },
    body: JSON.stringify({ messageId: email.messageId, from: email.from, to: mailbox.email, subject: email.subject, text: email.text })
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  logger.info(`Email salvata per ${mailbox.email}: ${email.subject}`);
}

function connectMailbox(mailbox: MailboxConfig) {
  if (clients.has(mailbox.id)) return;
  const client = new Imap({
    user: mailbox.username,
    password: mailbox.password,
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    tls: true,
    tlsOptions: { servername: mailbox.imapHost }
  });
  clients.set(mailbox.id, client);

  client.once("ready", () => {
    client.openBox("INBOX", false, (error, box) => {
      if (error) return logger.error(`INBOX ${mailbox.email}: ${error.message}`);
      logger.info(`IMAP connesso: ${mailbox.email}`);
      client.on("mail", (newMessageCount) => {
        const firstNewSequence = box.messages.total - newMessageCount + 1;
        const fetcher = client.seq.fetch(`${firstNewSequence}:*`, { bodies: "" });
        fetcher.on("message", (message) => message.on("body", async (stream) => {
          try { await registerEmail(mailbox, await simpleParser(stream)); }
          catch (processingError) { logger.error(`Elaborazione ${mailbox.email}: ${processingError instanceof Error ? processingError.message : processingError}`); }
        }));
        fetcher.once("error", (fetchError) => logger.error(`Lettura ${mailbox.email}: ${fetchError.message}`));
      });
    });
  });
  client.once("error", (error) => {
    logger.error(`IMAP ${mailbox.email}: ${error.message}`);
    clients.delete(mailbox.id);
  });
  client.once("end", () => clients.delete(mailbox.id));
  client.connect();
}

async function loadMailboxes() {
  try {
    const response = await fetch(`${apiUrl}/api/internal/mailboxes`, { headers: { "x-internal-key": process.env.INTERNAL_API_KEY ?? "" } });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const mailboxes = await response.json() as MailboxConfig[];
    mailboxes.forEach(connectMailbox);
    if (!mailboxes.length) logger.info("Nessuna casella attiva: configurane una dalla dashboard");
  } catch (error) {
    logger.error(`Caricamento caselle: ${error instanceof Error ? error.message : error}`);
  }
}

const startImapListener = async () => {
  await loadMailboxes();
  setInterval(() => void loadMailboxes(), 60_000);
};

module.exports = { startImapListener };
