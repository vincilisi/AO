export type EmailCategory = "preventivo" | "ordine" | "informazioni" | "reclamo" | "generale";
export type Priority = "bassa" | "media" | "alta" | "urgente";

export interface EmailDecision {
  category: EmailCategory;
  priority: Priority;
  department: "commerciale" | "amministrazione" | "customer-care" | "generale";
  actions: Array<"create-task" | "create-quote" | "notify-team" | "draft-reply">;
}

export function analyzeEmail(subject: string, body: string): EmailDecision {
  const content = `${subject} ${body}`.toLowerCase();
  const urgent = /urgente|immediato|bloccante/.test(content);
  const complaint = /reclamo|problema|disservizio|rimborso/.test(content);
  const quote = /preventivo|offerta|prezzo|costo/.test(content);
  const order = /ordine|acquisto|conferma/.test(content);

  if (complaint) {
    return { category: "reclamo", priority: urgent ? "urgente" : "alta", department: "customer-care", actions: ["create-task", "notify-team", "draft-reply"] };
  }
  if (quote) {
    return { category: "preventivo", priority: urgent ? "alta" : "media", department: "commerciale", actions: ["create-quote", "create-task", "draft-reply"] };
  }
  if (order) {
    return { category: "ordine", priority: "alta", department: "amministrazione", actions: ["create-task", "notify-team"] };
  }
  if (/informazioni|informazione|richiesta/.test(content)) {
    return { category: "informazioni", priority: urgent ? "alta" : "media", department: "customer-care", actions: ["create-task", "draft-reply"] };
  }
  return { category: "generale", priority: urgent ? "alta" : "bassa", department: "generale", actions: ["create-task"] };
}

export interface CatalogItemReference {
  id: string;
  sku: string;
  name: string;
}

export interface ExtractedQuoteItem {
  productId: string;
  quantity: number;
}

export interface QuoteRequestExtraction {
  items: ExtractedQuoteItem[];
  missingProducts: boolean;
  missingQuantities: string[];
  ambiguousProducts: string[];
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractQuoteRequest(subject: string, body: string, catalog: CatalogItemReference[]): QuoteRequestExtraction {
  const content = normalized(`${subject} ${body}`);
  const matched = catalog.map((product) => {
    const aliases = [product.sku, product.name].map(normalized).filter(Boolean).sort((left, right) => right.length - left.length);
    return { product, aliases, alias: aliases.find((value) => new RegExp(`(^|[^a-z0-9])${escaped(value)}([^a-z0-9]|$)`).test(content)) };
  }).filter((match): match is { product: CatalogItemReference; aliases: string[]; alias: string } => Boolean(match.alias));

  const ambiguousProducts = matched.filter((match, index) => matched.some((other, otherIndex) => otherIndex !== index && other.alias === match.alias)).map((match) => match.product.name);
  const usable = matched.filter((match) => !ambiguousProducts.includes(match.product.name));
  const items: ExtractedQuoteItem[] = [];
  const missingQuantities: string[] = [];

  for (const match of usable) {
    const alias = escaped(match.alias);
    const before = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:x|pz|pezzi|unita|ore|giorni)?\\s+(?:di\\s+)?${alias}(?:[^a-z0-9]|$)`);
    const after = new RegExp(`${alias}\\s*(?:x|quantita|qta|n\\.?|:|-)\\s*(\\d+(?:[.,]\\d+)?)`);
    const generic = usable.length === 1 ? /(?:quantita|qta|n\.?|x)\s*(\d+(?:[.,]\d+)?)/ : null;
    const quantityText = content.match(before)?.[1] ?? content.match(after)?.[1] ?? (generic ? content.match(generic)?.[1] : undefined);
    const quantity = quantityText ? Number(quantityText.replace(",", ".")) : Number.NaN;
    if (Number.isFinite(quantity) && quantity > 0) items.push({ productId: match.product.id, quantity });
    else missingQuantities.push(match.product.name);
  }

  return { items, missingProducts: matched.length === 0, missingQuantities, ambiguousProducts };
}