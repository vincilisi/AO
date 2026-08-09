const bearer = [{ bearerAuth: [] }];
const json = { content: { "application/json": { schema: { type: "object" } } } };

function route(summary: string, tags: string[], method: "get" | "post" | "patch", secured = true) {
  return { [method]: { summary, tags, ...(secured ? { security: bearer } : {}), responses: { "200": { description: "Operazione riuscita", ...json }, "400": { description: "Richiesta non valida" }, "401": { description: "Non autenticato" } } } };
}

export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "AI Office Manager API", version: "1.0.0", description: "API multi-tenant per email, CRM, preventivi, HR, automazioni e billing PayPal." },
  servers: [{ url: "http://127.0.0.1:4000", description: "Sviluppo locale" }],
  tags: ["Auth", "Onboarding", "Billing", "Email", "CRM", "Quotes", "HR", "Automations"].map((name) => ({ name })),
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" } } },
  paths: {
    "/health": route("Stato API e database", ["Auth"], "get", false),
    "/api/auth/register": route("Registra azienda e proprietario", ["Auth"], "post", false),
    "/api/auth/login": route("Crea una sessione", ["Auth"], "post", false),
    "/api/auth/me": route("Profilo autenticato", ["Auth"], "get"),
    "/api/plans": route("Catalogo piani SaaS", ["Billing"], "get", false),
    "/api/subscription": route("Abbonamento corrente", ["Billing"], "get"),
    "/api/subscription/checkout": route("Avvia approvazione PayPal", ["Billing"], "post"),
    "/api/onboarding": { ...route("Stato onboarding", ["Onboarding"], "get"), ...route("Configura AI e moduli", ["Onboarding"], "patch") },
    "/api/onboarding/complete": route("Completa onboarding", ["Onboarding"], "post"),
    "/api/mailboxes": { ...route("Elenca caselle", ["Email"], "get"), ...route("Verifica e collega casella", ["Email"], "post") },
    "/api/emails": route("Elenca posta aziendale", ["Email"], "get"),
    "/api/customers": { ...route("Elenca clienti", ["CRM"], "get"), ...route("Crea cliente", ["CRM"], "post") },
    "/api/customers/{id}": { ...route("Scheda e timeline cliente", ["CRM"], "get"), ...route("Aggiorna preferenze cliente", ["CRM"], "patch") },
    "/api/tickets": { ...route("Elenca ticket", ["CRM"], "get"), ...route("Crea ticket", ["CRM"], "post") },
    "/api/products": { ...route("Elenca listino", ["Quotes"], "get"), ...route("Crea voce listino", ["Quotes"], "post") },
    "/api/quotes": { ...route("Elenca preventivi", ["Quotes"], "get"), ...route("Crea preventivo PDF", ["Quotes"], "post") },
    "/api/quotes/{id}/send": route("Invia preventivo", ["Quotes"], "post"),
    "/api/quotes/{id}/revise": route("Crea revisione", ["Quotes"], "post"),
    "/api/quotes/{id}/approve": route("Approva e crea ordine", ["Quotes"], "post"),
    "/api/orders": route("Elenca ordini", ["Quotes"], "get"),
    "/api/employees": { ...route("Elenca personale", ["HR"], "get"), ...route("Crea dipendente", ["HR"], "post") },
    "/api/employees/{id}/attendance": route("Registra presenza", ["HR"], "post"),
    "/api/hr/reports/weekly": route("Genera report settimanale", ["HR"], "post"),
    "/api/automations": route("Elenca regole", ["Automations"], "get"),
    "/api/automations/{id}": route("Attiva o disattiva regola", ["Automations"], "patch")
  }
};

export const apiDocsHtml = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI Office API</title><style>body{margin:0;font:15px Georgia,serif;color:#17211d;background:#f5f7f4}main{max-width:920px;margin:auto;padding:48px 24px}header{padding:32px;background:#173f34;color:white;border-radius:8px}code{font-family:Consolas,monospace}.route{display:grid;grid-template-columns:80px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid #d9e0dc}.method{font:700 12px Consolas;color:#1f5946}.tag{color:#68736d;font-size:12px}a{color:#1f5946}</style></head><body><main><header><small>AO / DEVELOPERS</small><h1>AI Office Manager API</h1><p>REST multi-tenant per integrare il centro operativo aziendale.</p></header><p>Autenticazione: <code>Authorization: Bearer &lt;token&gt;</code>. Specifica macchina: <a href="/api/openapi.json">OpenAPI JSON</a>.</p><div id="routes"></div></main><script>fetch('/api/openapi.json').then(r=>r.json()).then(api=>{document.querySelector('#routes').innerHTML=Object.entries(api.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,data])=>'<div class="route"><span class="method">'+method.toUpperCase()+'</span><div><code>'+path+'</code><br><span class="tag">'+data.tags.join(' · ')+' — '+data.summary+'</span></div></div>')).join('')})</script></body></html>`;
