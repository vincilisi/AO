export interface Quote {
  id: string;
  customer: string;
  title: string;
  amount: number;
  status: "bozza" | "inviato" | "approvato" | "rifiutato";
  createdAt: string;
}

export type PlanCode = "BASE" | "PRO" | "BUSINESS" | "ENTERPRISE";

export interface SaaSPlan {
  code: PlanCode;
  audience: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  setupPriceCents: number;
  capacity: string;
  highlighted: boolean;
  limits: {
    mailboxes: number;
    users: number | null;
    monthlyEmails: number;
  };
  features: string[];
}

export const SAAS_PLANS: readonly SaaSPlan[] = [
  {
    code: "BASE",
    audience: "Professionista",
    name: "Base",
    description: "Per chi vuole delegare email, clienti e preventivi senza una struttura complessa.",
    monthlyPriceCents: 4900,
    setupPriceCents: 19000,
    capacity: "Fino a 5 ore operative recuperabili al mese",
    highlighted: false,
    limits: { mailboxes: 1, users: 1, monthlyEmails: 300 },
    features: ["1 casella email", "Archivio ricevute e inviate", "CRM clienti", "Listino e preventivi PDF", "Installazione e configurazione iniziale"]
  },
  {
    code: "PRO",
    audience: "Studio e microimpresa",
    name: "Pro",
    description: "Per piccoli team che automatizzano email, preventivi e relazione con i clienti.",
    monthlyPriceCents: 9900,
    setupPriceCents: 49000,
    capacity: "Fino a 20 ore operative recuperabili al mese",
    highlighted: true,
    limits: { mailboxes: 3, users: 5, monthlyEmails: 1200 },
    features: ["3 caselle email", "5 utenti", "Risposte automatiche", "CRM e storico cliente", "Preventivi e follow-up", "Onboarding guidato"]
  },
  {
    code: "BUSINESS",
    audience: "Piccola azienda",
    name: "Business",
    description: "Per uffici che vogliono automatizzare il lavoro commerciale e amministrativo quotidiano.",
    monthlyPriceCents: 19900,
    setupPriceCents: 99000,
    capacity: "Fino a 40 ore operative recuperabili al mese",
    highlighted: false,
    limits: { mailboxes: 5, users: 10, monthlyEmails: 3000 },
    features: ["Fino a 5 caselle email", "10 utenti", "Risposte automatiche", "CRM, listino e preventivi", "Attività e personale", "Installazione, importazione e formazione"]
  },
  {
    code: "ENTERPRISE",
    audience: "Grande azienda",
    name: "Enterprise",
    description: "Per organizzazioni con più reparti, volumi elevati e processi da integrare.",
    monthlyPriceCents: 74900,
    setupPriceCents: 490000,
    capacity: "Oltre 150 ore operative recuperabili al mese",
    highlighted: false,
    limits: { mailboxes: 25, users: null, monthlyEmails: 20000 },
    features: ["Fino a 25 caselle email", "Utenti senza limite", "Workflow multi-reparto", "Volumi email elevati", "Integrazioni su progetto", "Installazione dedicata e formazione team"]
  }
] as const;

export function findSaaSPlan(code: string) {
  return SAAS_PLANS.find((plan) => plan.code === code);
}

export class BillingService {
  private quotes: Quote[] = [
    { id: "quo-1", customer: "Studio Bianchi", title: "Automazione customer care", amount: 4800, status: "inviato", createdAt: new Date().toISOString() },
    { id: "quo-2", customer: "Conti Retail", title: "Setup CRM", amount: 2600, status: "bozza", createdAt: new Date(Date.now() - 86400000).toISOString() }
  ];

  list() { return [...this.quotes]; }

  create(input: Pick<Quote, "customer" | "title" | "amount">) {
    const quote: Quote = { ...input, id: crypto.randomUUID(), status: "bozza", createdAt: new Date().toISOString() };
    this.quotes.unshift(quote);
    return quote;
  }
}