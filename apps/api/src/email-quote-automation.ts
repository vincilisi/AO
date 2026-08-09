import { database, type Email, type Mailbox, type Task } from "@ai-office/database";
import { extractQuoteRequest } from "@ai-office/ai-core";
import { sendMailboxEmail } from "./mailbox-service.js";
import { generateQuotePdf, sendQuoteEmail } from "./quote-service.js";

function prismaBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

function senderIdentity(value: string) {
  const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
  if (!email) return null;
  const displayName = value.slice(0, value.toLowerCase().indexOf(email)).replace(/["'<>]/g, "").trim();
  const fallbackName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { email, name: displayName || fallbackName };
}

async function sendClarification(input: {
  companyId: string;
  mailbox: Mailbox;
  email: Email;
  task: Task;
  customerId: string;
  text: string;
}) {
  const subject = input.email.subject.toLowerCase().startsWith("re:") ? input.email.subject : `Re: ${input.email.subject}`;
  const messageId = await sendMailboxEmail(input.mailbox, { to: input.email.from, subject, text: input.text, inReplyTo: input.email.messageId });
  await database.$transaction([
    database.email.update({ where: { id: input.email.id }, data: { customerId: input.customerId, status: "REPLIED", repliedAt: new Date() } }),
    database.task.update({ where: { id: input.task.id }, data: { customerId: input.customerId, description: `${input.task.description ?? ""}\n\nChiarimento automatico inviato.`.trim() } }),
    database.email.create({ data: { companyId: input.companyId, mailboxId: input.mailbox.id, customerId: input.customerId, messageId, from: input.mailbox.email, to: input.email.from, subject, text: input.text, category: "preventivo", priority: input.email.priority, direction: "OUTBOUND", status: "SENT", inReplyTo: input.email.messageId, sentAt: new Date() } })
  ]);
  return { kind: "clarification" as const, customerId: input.customerId };
}

export async function automateQuoteRequest(input: {
  companyId: string;
  mailbox: Mailbox;
  email: Email;
  task: Task;
}) {
  const sender = senderIdentity(input.email.from);
  if (!sender) return { kind: "invalid-sender" as const };

  const customer = await database.customer.upsert({
    where: { companyId_email: { companyId: input.companyId, email: sender.email } },
    create: { companyId: input.companyId, name: sender.name, companyName: sender.name, email: sender.email, status: "attivo" },
    update: { lastContact: new Date() }
  });
  const products = await database.product.findMany({ where: { companyId: input.companyId, active: true }, orderBy: { name: "asc" } });
  const extraction = extractQuoteRequest(input.email.subject, input.email.text, products);
  const signature = input.mailbox.displayName ?? input.mailbox.email;

  if (extraction.missingProducts || extraction.ambiguousProducts.length || extraction.missingQuantities.length) {
    let request = "Per preparare il preventivo ho bisogno del codice o nome della voce e della quantità.";
    if (extraction.ambiguousProducts.length) request = `Per evitare errori, indichi il codice SKU per: ${extraction.ambiguousProducts.join(", ")}.`;
    else if (extraction.missingQuantities.length) request = `Indichi la quantità richiesta per: ${extraction.missingQuantities.join(", ")}.`;
    const available = products.slice(0, 8).map((product) => `${product.sku} - ${product.name}`).join("\n");
    const text = `Buongiorno ${customer.name},\n\n${request}${extraction.missingProducts && available ? `\n\nVoci disponibili:\n${available}` : ""}\n\nCordiali saluti,\n${signature}`;
    return sendClarification({ ...input, customerId: customer.id, text });
  }

  const selectedProducts = new Map(products.map((product) => [product.id, product]));
  const items = extraction.items.map((item) => {
    const product = selectedProducts.get(item.productId);
    if (!product) throw new Error("Prodotto estratto non disponibile");
    return { description: `${product.name}${product.description ? ` - ${product.description}` : ""}`, quantity: item.quantity, unitPrice: product.unitPrice, total: Math.round(item.quantity * product.unitPrice * 100) / 100, taxRate: product.taxRate };
  });
  const taxRates = [...new Set(items.map((item) => item.taxRate))];
  if (taxRates.length !== 1) {
    const text = `Buongiorno ${customer.name},\n\nla richiesta contiene voci con aliquote IVA diverse e richiede una verifica commerciale. L'abbiamo presa in carico e le risponderemo al più presto.\n\nCordiali saluti,\n${signature}`;
    return sendClarification({ ...input, customerId: customer.id, text });
  }

  const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const taxRate = taxRates[0];
  const taxAmount = Math.round(subtotal * taxRate) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const sequence = await database.quote.count({ where: { companyId: input.companyId, createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } } });
  const number = `${new Date().getFullYear()}-${String(sequence + 1).padStart(4, "0")}`;
  const quote = await database.quote.create({
    data: {
      companyId: input.companyId,
      customerId: customer.id,
      number,
      title: `Offerta richiesta: ${input.email.subject}`,
      subtotal,
      taxRate,
      taxAmount,
      total,
      validUntil: new Date(Date.now() + 30 * 86400000),
      notes: "Preventivo generato automaticamente dal listino aziendale.",
      items: { create: items.map(({ taxRate: _taxRate, ...item }) => item) }
    },
    include: { company: true, customer: true, items: true }
  });
  const pdf = await generateQuotePdf(quote);
  const delivery = await sendQuoteEmail(quote, pdf, input.mailbox);
  await database.$transaction([
    database.quote.update({ where: { id: quote.id }, data: { status: "inviato", sentAt: new Date(), pdfData: prismaBytes(pdf), pdfFilename: `preventivo-${number}.pdf` } }),
    database.email.update({ where: { id: input.email.id }, data: { customerId: customer.id, status: "REPLIED", repliedAt: new Date() } }),
    database.task.update({ where: { id: input.task.id }, data: { customerId: customer.id, status: "completato", description: `${input.task.description ?? ""}\n\nPreventivo ${number} generato e inviato automaticamente.`.trim() } }),
    database.email.create({ data: { companyId: input.companyId, mailboxId: input.mailbox.id, customerId: customer.id, messageId: delivery.messageId, from: input.mailbox.email, to: customer.email, subject: delivery.subject, text: delivery.text, category: "preventivo", priority: input.email.priority, direction: "OUTBOUND", status: "SENT", inReplyTo: input.email.messageId, sentAt: new Date() } }),
    database.activity.create({ data: { companyId: input.companyId, type: "quote", title: "Preventivo automatico inviato", detail: `${number} · ${customer.email}` } })
  ]);
  return { kind: "quote-sent" as const, customerId: customer.id, quoteId: quote.id, quoteNumber: number };
}
