import PDFDocument from "pdfkit";
import { sendMailboxEmail } from "./mailbox-service.js";

interface QuoteDocument {
  number: string;
  title: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  validUntil: Date | null;
  company: { name: string; email: string; vatNumber: string | null; address: string | null; city: string | null };
  customer: { name: string; companyName: string; email: string };
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
}

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export async function generateQuotePdf(quote: QuoteDocument) {
  const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Preventivo ${quote.number}` } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.font("Helvetica-Bold").fontSize(22).fillColor("#173f34").text(quote.company.name);
  document.font("Helvetica").fontSize(9).fillColor("#58645e").text([quote.company.address, quote.company.city, quote.company.vatNumber ? `P. IVA ${quote.company.vatNumber}` : null, quote.company.email].filter(Boolean).join(" · "));
  document.moveDown(2);
  document.font("Helvetica-Bold").fontSize(18).fillColor("#17211d").text(`PREVENTIVO ${quote.number}`);
  document.font("Helvetica").fontSize(10).text(`Cliente: ${quote.customer.companyName || quote.customer.name}`);
  document.text(`Email: ${quote.customer.email}`);
  if (quote.validUntil) document.text(`Valido fino al: ${quote.validUntil.toLocaleDateString("it-IT")}`);
  document.moveDown(1.5).font("Helvetica-Bold").fontSize(14).text(quote.title);
  document.moveDown();

  for (const item of quote.items) {
    const rowY = document.y;
    document.font("Helvetica").fontSize(10).text(item.description, 48, rowY, { width: 270 });
    document.text(`${item.quantity} × ${euro.format(item.unitPrice)}`, 330, rowY, { width: 110, align: "right" });
    document.font("Helvetica-Bold").text(euro.format(item.total), 450, rowY, { width: 95, align: "right" });
    document.moveTo(48, document.y + 8).lineTo(547, document.y + 8).strokeColor("#dde3df").stroke();
    document.y += 18;
  }

  document.moveDown();
  document.font("Helvetica").text(`Imponibile: ${euro.format(quote.subtotal)}`, { align: "right" });
  document.text(`IVA ${quote.taxRate}%: ${euro.format(quote.taxAmount)}`, { align: "right" });
  document.font("Helvetica-Bold").fontSize(14).fillColor("#173f34").text(`Totale: ${euro.format(quote.total)}`, { align: "right" });
  if (quote.notes) document.moveDown(2).font("Helvetica").fontSize(9).fillColor("#58645e").text(`Note: ${quote.notes}`);
  document.end();
  return completed;
}

export async function sendQuoteEmail(quote: QuoteDocument, pdf: Buffer, mailbox: Parameters<typeof sendMailboxEmail>[0]) {
  const subject = `Preventivo ${quote.number} · ${quote.title}`;
  const text = `Buongiorno ${quote.customer.name},\n\nin allegato trova il preventivo ${quote.number}.\n\nCordiali saluti,\n${quote.company.name}`;
  const messageId = await sendMailboxEmail(mailbox, { to: quote.customer.email, subject, text, attachments: [{ filename: `preventivo-${quote.number}.pdf`, content: pdf, contentType: "application/pdf" }] });
  return { messageId, subject, text };
}