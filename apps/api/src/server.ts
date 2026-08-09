import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { Prisma, database } from "@ai-office/database";
import { analyzeEmail } from "@ai-office/ai-core";
import { findSaaSPlan, SAAS_PLANS } from "@ai-office/billing";
import { authenticate, createSession, hashPassword, tokenHash, verifyPassword } from "./auth.js";
import { generateQuotePdf, sendQuoteEmail } from "./quote-service.js";
import { decryptMailboxPassword, encryptMailboxPassword, sendMailboxEmail, verifyMailbox } from "./mailbox-service.js";
import { createPayPalSubscription, getPayPalSubscription, paypalApprovalUrl, verifyPayPalWebhook, type PayPalWebhookEvent } from "./paypal-service.js";
import { automateQuoteRequest } from "./email-quote-automation.js";
import { apiDocsHtml, openApiDocument } from "./openapi.js";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

interface LiveSocket {
  send(data: string): void;
  close(): void;
  on(event: "close", listener: () => void): void;
  readyState: number;
  companyId?: string;
}

const sockets = new Set<LiveSocket>();

function publish(companyId: string, type: string, payload: unknown) {
  const message = JSON.stringify({ type, payload, sentAt: new Date().toISOString() });
  for (const socket of sockets) {
    if (socket.readyState === 1 && socket.companyId === companyId) socket.send(message);
  }
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw Object.assign(new Error(`Campo obbligatorio: ${field}`), { statusCode: 400 });
  return value.trim();
}

function emailValue(value: unknown, field: string) {
  const email = stringValue(value, field).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error(`Email non valida: ${field}`), { statusCode: 400 });
  return email;
}

function publicCustomer(customer: { id: string; name: string; companyName: string; email: string; phone: string | null; status: string; satisfaction: number; lastContact: Date }) {
  return { ...customer, company: customer.companyName, status: customer.status.toLowerCase(), lastContact: customer.lastContact.toISOString() };
}

function publicTask(task: { id: string; title: string; owner: string; status: string; priority: string; dueAt: Date | null }) {
  return { ...task, status: task.status.toLowerCase(), priority: task.priority.toLowerCase(), dueAt: (task.dueAt ?? new Date()).toISOString() };
}

function publicQuote(quote: { id: string; number: string; title: string; status: string; total: number; createdAt: Date; sentAt: Date | null; customer: { name: string; companyName: string } }) {
  return { id: quote.id, number: quote.number, title: quote.title, status: quote.status.toLowerCase(), amount: quote.total, customer: quote.customer.companyName || quote.customer.name, createdAt: quote.createdAt.toISOString(), sentAt: quote.sentAt?.toISOString() ?? null };
}

function prismaBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

async function quoteWithRelations(companyId: string, quoteId: string) {
  const quote = await database.quote.findFirst({ where: { id: quoteId, companyId }, include: { company: true, customer: true, items: true } });
  if (!quote) throw Object.assign(new Error("Preventivo non trovato"), { statusCode: 404 });
  return quote;
}

async function resolveEmailCompany(request: FastifyRequest, recipient?: string) {
  if (request.headers.authorization) return (await authenticate(request)).companyId;
  if (!process.env.INTERNAL_API_KEY || request.headers["x-internal-key"] !== process.env.INTERNAL_API_KEY) throw Object.assign(new Error("Chiave interna non valida"), { statusCode: 401 });
  const normalized = recipient?.toLowerCase() ?? "";
  const mailbox = await database.mailbox.findFirst({ where: { enabled: true, email: { equals: normalized, mode: "insensitive" } } });
  if (mailbox) return mailbox.companyId;
  const company = await database.company.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } } });
  if (!company) throw Object.assign(new Error("Nessuna casella associata al destinatario"), { statusCode: 404 });
  return company.id;
}

async function syncPayPalSubscription(paypalSubscriptionId: string, expectedCompanyId?: string, statusOverride?: string) {
  const remote = await getPayPalSubscription(paypalSubscriptionId);
  const companyId = remote.custom_id ?? expectedCompanyId;
  if (!companyId || (expectedCompanyId && companyId !== expectedCompanyId)) throw Object.assign(new Error("Abbonamento PayPal non associato all'azienda"), { statusCode: 409 });
  const current = await database.subscription.findUnique({ where: { companyId } });
  const status = statusOverride ?? (remote.status === "ACTIVE" && current?.trialEndsAt && current.trialEndsAt > new Date() ? "TRIALING" : remote.status);
  await database.subscription.updateMany({ where: { companyId }, data: {
    status,
    paypalPlanId: remote.plan_id,
    paypalSubscriptionId: remote.id,
    paypalPayerId: remote.subscriber?.payer_id ?? null,
    currentPeriodEndsAt: remote.billing_info?.next_billing_time ? new Date(remote.billing_info.next_billing_time) : null,
    cancelAtPeriodEnd: false
  } });
  publish(companyId, "subscription.updated", { status, planCode: current?.planCode });
  return remote;
}

const defaultModules = { crm: true, email: true, quotes: true, hr: false, automations: true };

async function ensureCommercialSetup(companyId: string) {
  const [onboarding, aiConfiguration] = await database.$transaction([
    database.onboarding.upsert({ where: { companyId }, create: { companyId, modules: defaultModules }, update: {} }),
    database.aIConfiguration.upsert({ where: { companyId }, create: { companyId }, update: {} })
  ]);
  const ruleCount = await database.automationRuleRecord.count({ where: { companyId } });
  if (!ruleCount) await database.automationRuleRecord.createMany({ data: [
    { companyId, name: "Email in attività", trigger: "email.received", actions: ["create-task", "draft-reply"] },
    { companyId, name: "Preventivo in ordine", trigger: "quote.approved", actions: ["create-order", "notify"] },
    { companyId, name: "Cliente in ticket", trigger: "customer.support", actions: ["create-ticket", "notify"] },
    { companyId, name: "Presenze in report", trigger: "attendance.weekly", actions: ["create-report", "notify"] }
  ] });
  return { onboarding, aiConfiguration };
}

async function planForCompany(companyId: string) {
  const subscription = await database.subscription.findUnique({ where: { companyId } });
  return findSaaSPlan(subscription?.planCode ?? "BASE") ?? findSaaSPlan("BASE")!;
}

async function automationExecutions(companyId: string, trigger: string) {
  await ensureCommercialSetup(companyId);
  const rules = await database.automationRuleRecord.findMany({ where: { companyId, trigger, enabled: true } });
  return rules.flatMap((rule) => rule.actions.map((action) => ({ ruleId: rule.id, action })));
}

function publicMailbox(mailbox: { id: string; email: string; displayName: string | null; username: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; isPrimary: boolean; autoReply: boolean; enabled: boolean }) {
  return mailbox;
}

function publicEmail(email: { id: string; messageId: string; from: string; to: string; subject: string; text: string; category: string; priority: string; direction: string; status: string; receivedAt: Date; sentAt: Date | null; repliedAt: Date | null; mailbox: { email: string } | null }) {
  return { ...email, receivedAt: email.receivedAt.toISOString(), sentAt: email.sentAt?.toISOString() ?? null, repliedAt: email.repliedAt?.toISOString() ?? null, mailbox: email.mailbox?.email ?? null };
}

async function buildServer() {
  const app = Fastify({ logger: true, bodyLimit: 2_000_000 });
  await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"] });
  await app.register(websocket);

  app.setErrorHandler((error, _request, reply) => {
    let message = error instanceof Error ? error.message : "Errore interno";
    let statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 500;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      message = "Un record con questi dati esiste già";
      statusCode = 409;
    }
    app.log.error(error);
    reply.status(statusCode).send({ error: message });
  });

  app.get("/health", async () => {
    await database.$queryRaw`SELECT 1`;
    return { status: "ok", service: "ai-office-api", database: "postgresql", timestamp: new Date().toISOString() };
  });

  app.get("/api/openapi.json", async () => openApiDocument);
  app.get("/api/docs", async (_request, reply) => reply.type("text/html; charset=utf-8").send(apiDocsHtml));

  app.post<{ Body: PayPalWebhookEvent }>("/api/paypal/webhook", async (request, reply) => {
    if (!await verifyPayPalWebhook(request.headers, request.body)) throw Object.assign(new Error("Firma PayPal non valida"), { statusCode: 400 });
    const resource = request.body.resource;
    const subscriptionId = resource.billing_agreement_id ?? (request.body.event_type.startsWith("BILLING.SUBSCRIPTION.") ? resource.id : undefined);
    if (subscriptionId) {
      const statusOverride = request.body.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" ? "PAST_DUE" : undefined;
      await syncPayPalSubscription(subscriptionId, undefined, statusOverride);
    }
    return reply.send({ received: true });
  });

  app.post<{ Body: Record<string, unknown> }>("/api/auth/register", async (request, reply) => {
    const name = stringValue(request.body.name, "name");
    const email = emailValue(request.body.email, "email");
    const password = stringValue(request.body.password, "password");
    const companyName = stringValue(request.body.companyName, "companyName");
    if (password.length < 8) throw Object.assign(new Error("La password deve contenere almeno 8 caratteri"), { statusCode: 400 });
    const passwordHash = await hashPassword(password);
    const result = await database.$transaction(async (transaction) => {
      const company = await transaction.company.create({ data: {
        name: companyName,
        email: emailValue(request.body.companyEmail ?? email, "companyEmail"),
        vatNumber: typeof request.body.vatNumber === "string" && request.body.vatNumber.trim() ? request.body.vatNumber.trim() : null,
        phone: typeof request.body.phone === "string" ? request.body.phone.trim() || null : null,
        address: typeof request.body.address === "string" ? request.body.address.trim() || null : null,
        city: typeof request.body.city === "string" ? request.body.city.trim() || null : null,
        postalCode: typeof request.body.postalCode === "string" ? request.body.postalCode.trim() || null : null
      } });
      const user = await transaction.user.create({ data: { companyId: company.id, name, email, passwordHash } });
      await transaction.onboarding.create({ data: { companyId: company.id, modules: defaultModules } });
      await transaction.aIConfiguration.create({ data: { companyId: company.id } });
      await transaction.automationRuleRecord.createMany({ data: [
        { companyId: company.id, name: "Email in attività", trigger: "email.received", actions: ["create-task", "draft-reply"] },
        { companyId: company.id, name: "Preventivo in ordine", trigger: "quote.approved", actions: ["create-order", "notify"] },
        { companyId: company.id, name: "Cliente in ticket", trigger: "customer.support", actions: ["create-ticket", "notify"] },
        { companyId: company.id, name: "Presenze in report", trigger: "attendance.weekly", actions: ["create-report", "notify"] }
      ] });
      return { company, user };
    });
    const token = await createSession(result.user.id, result.company.id);
    return reply.status(201).send({ token, user: { id: result.user.id, name, email, role: result.user.role }, company: result.company });
  });

  app.post<{ Body: Record<string, unknown> }>("/api/auth/login", async (request, reply) => {
    const email = emailValue(request.body.email, "email");
    const password = stringValue(request.body.password, "password");
    const user = await database.user.findUnique({ where: { email }, include: { company: true } });
    if (!user || !await verifyPassword(password, user.passwordHash)) throw Object.assign(new Error("Credenziali non valide"), { statusCode: 401 });
    const token = await createSession(user.id, user.companyId);
    return reply.send({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, company: user.company });
  });

  app.get("/api/auth/me", async (request) => {
    const auth = await authenticate(request);
    const company = await database.company.findUniqueOrThrow({ where: { id: auth.companyId } });
    return { user: auth, company };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) await database.session.deleteMany({ where: { tokenHash: tokenHash(authorization.slice(7)) } });
    return reply.status(204).send();
  });

  app.get("/api/plans", async () => SAAS_PLANS);

  app.get("/api/subscription", async (request) => {
    const auth = await authenticate(request);
    let subscription = await database.subscription.findUnique({ where: { companyId: auth.companyId } });
    if (subscription?.paypalSubscriptionId && subscription.status === "APPROVAL_PENDING") {
      await syncPayPalSubscription(subscription.paypalSubscriptionId, auth.companyId);
      subscription = await database.subscription.findUnique({ where: { companyId: auth.companyId } });
    }
    return subscription ? { subscription, plan: findSaaSPlan(subscription.planCode) ?? null } : { subscription: null, plan: null };
  });

  app.post<{ Body: { planCode?: string } }>("/api/subscription/checkout", async (request) => {
    const auth = await authenticate(request);
    const plan = findSaaSPlan(request.body.planCode ?? "");
    if (!plan) throw Object.assign(new Error("Piano non valido"), { statusCode: 400 });
    const [company, subscription] = await Promise.all([
      database.company.findUniqueOrThrow({ where: { id: auth.companyId } }),
      database.subscription.findUnique({ where: { companyId: auth.companyId } })
    ]);
    if (subscription?.paypalSubscriptionId && subscription.planCode === plan.code && subscription.status === "APPROVAL_PENDING") {
      const pending = await getPayPalSubscription(subscription.paypalSubscriptionId);
      const approvalUrl = paypalApprovalUrl(pending);
      if (approvalUrl) return { url: approvalUrl };
    }
    if (subscription?.paypalSubscriptionId && ["ACTIVE", "TRIALING", "PAST_DUE", "SUSPENDED"].includes(subscription.status)) {
      throw Object.assign(new Error("Abbonamento PayPal già presente: usa Gestisci abbonamento"), { statusCode: 409 });
    }
    const checkout = await createPayPalSubscription({
      companyId: company.id,
      companyEmail: company.email,
      paypalPlanId: subscription?.planCode === plan.code ? subscription.paypalPlanId : null,
      plan
    });
    await database.subscription.upsert({
      where: { companyId: auth.companyId },
      create: { companyId: auth.companyId, planCode: plan.code, status: "APPROVAL_PENDING", monthlyPriceCents: plan.monthlyPriceCents, setupPriceCents: plan.setupPriceCents, paypalPlanId: checkout.planId, paypalSubscriptionId: checkout.subscriptionId, trialEndsAt: new Date(Date.now() + 14 * 86400000) },
      update: { planCode: plan.code, status: "APPROVAL_PENDING", monthlyPriceCents: plan.monthlyPriceCents, setupPriceCents: plan.setupPriceCents, paypalPlanId: checkout.planId, paypalSubscriptionId: checkout.subscriptionId, paypalPayerId: null, trialEndsAt: new Date(Date.now() + 14 * 86400000) }
    });
    return { url: checkout.approvalUrl };
  });

  app.post("/api/subscription/portal", async (request) => {
    const auth = await authenticate(request);
    const subscription = await database.subscription.findUnique({ where: { companyId: auth.companyId } });
    if (!subscription?.paypalSubscriptionId) throw Object.assign(new Error("Nessun abbonamento PayPal"), { statusCode: 409 });
    return { url: process.env.PAYPAL_ENVIRONMENT === "live" ? "https://www.paypal.com/myaccount/autopay/" : "https://www.sandbox.paypal.com/myaccount/autopay/" };
  });

  app.get("/api/onboarding", async (request) => {
    const auth = await authenticate(request);
    const [{ onboarding, aiConfiguration }, mailboxCount, plan] = await Promise.all([
      ensureCommercialSetup(auth.companyId),
      database.mailbox.count({ where: { companyId: auth.companyId, enabled: true } }),
      planForCompany(auth.companyId)
    ]);
    return { onboarding, aiConfiguration, mailboxConnected: mailboxCount > 0, plan, steps: [
      { id: "company", label: "Profilo azienda", completed: true },
      { id: "mailbox", label: "Collega email", completed: mailboxCount > 0 },
      { id: "ai", label: "Configura AI", completed: onboarding.currentStep >= 3 },
      { id: "modules", label: "Attiva moduli", completed: onboarding.completed }
    ] };
  });

  app.patch<{ Body: Record<string, unknown> }>("/api/onboarding", async (request) => {
    const auth = await authenticate(request);
    await ensureCommercialSetup(auth.companyId);
    const threshold = Number(request.body.confidenceThreshold ?? 0.85);
    if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1) throw Object.assign(new Error("Soglia AI non valida"), { statusCode: 400 });
    const modules = request.body.modules && typeof request.body.modules === "object" ? request.body.modules as Prisma.InputJsonValue : undefined;
    const [onboarding, aiConfiguration] = await database.$transaction([
      database.onboarding.update({ where: { companyId: auth.companyId }, data: { currentStep: 3, modules } }),
      database.aIConfiguration.update({ where: { companyId: auth.companyId }, data: {
        tone: typeof request.body.tone === "string" ? request.body.tone : undefined,
        language: typeof request.body.language === "string" ? request.body.language : undefined,
        signature: typeof request.body.signature === "string" ? request.body.signature.trim() || null : undefined,
        instructions: typeof request.body.instructions === "string" ? request.body.instructions.trim() || null : undefined,
        autoReplyEnabled: typeof request.body.autoReplyEnabled === "boolean" ? request.body.autoReplyEnabled : undefined,
        confidenceThreshold: threshold
      } })
    ]);
    return { onboarding, aiConfiguration };
  });

  app.post("/api/onboarding/complete", async (request) => {
    const auth = await authenticate(request);
    const { aiConfiguration } = await ensureCommercialSetup(auth.companyId);
    const mailboxCount = await database.mailbox.count({ where: { companyId: auth.companyId, enabled: true } });
    if (!mailboxCount) throw Object.assign(new Error("Collega e verifica almeno una casella email"), { statusCode: 409 });
    const onboarding = await database.$transaction(async (transaction) => {
      await transaction.mailbox.updateMany({ where: { companyId: auth.companyId }, data: { autoReply: aiConfiguration.autoReplyEnabled } });
      await transaction.activity.create({ data: { companyId: auth.companyId, type: "onboarding", title: "Onboarding completato", detail: "Email, AI e moduli sono operativi" } });
      return transaction.onboarding.update({ where: { companyId: auth.companyId }, data: { currentStep: 4, completed: true } });
    });
    publish(auth.companyId, "onboarding.completed", onboarding);
    return onboarding;
  });

  app.get("/api/mailboxes", async (request) => {
    const auth = await authenticate(request);
    return (await database.mailbox.findMany({ where: { companyId: auth.companyId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] })).map(publicMailbox);
  });

  app.post<{ Body: Record<string, unknown> }>("/api/mailboxes", async (request, reply) => {
    const auth = await authenticate(request);
    const plan = await planForCompany(auth.companyId);
    const mailboxCount = await database.mailbox.count({ where: { companyId: auth.companyId } });
    if (mailboxCount >= plan.limits.mailboxes) throw Object.assign(new Error(`Il piano ${plan.name} consente ${plan.limits.mailboxes} caselle email`), { statusCode: 403 });
    const email = emailValue(request.body.email, "email");
    const password = stringValue(request.body.password, "password");
    const existingCount = await database.mailbox.count({ where: { companyId: auth.companyId } });
    const input = {
      email,
      displayName: typeof request.body.displayName === "string" ? request.body.displayName.trim() || null : null,
      username: typeof request.body.username === "string" && request.body.username.trim() ? request.body.username.trim() : email,
      passwordEncrypted: encryptMailboxPassword(password),
      imapHost: stringValue(request.body.imapHost, "imapHost"),
      imapPort: Number(request.body.imapPort ?? 993),
      smtpHost: stringValue(request.body.smtpHost, "smtpHost"),
      smtpPort: Number(request.body.smtpPort ?? 465)
    };
    if (!Number.isInteger(input.imapPort) || !Number.isInteger(input.smtpPort)) throw Object.assign(new Error("Porte email non valide"), { statusCode: 400 });
    await verifyMailbox(input);
    const mailbox = await database.$transaction(async (transaction) => {
      const isPrimary = existingCount === 0 || request.body.isPrimary === true;
      if (isPrimary) await transaction.mailbox.updateMany({ where: { companyId: auth.companyId }, data: { isPrimary: false } });
      return transaction.mailbox.create({ data: { companyId: auth.companyId, ...input, isPrimary, autoReply: request.body.autoReply === true } });
    });
    await database.company.update({ where: { id: auth.companyId }, data: { email: mailbox.isPrimary ? mailbox.email : undefined } });
    await ensureCommercialSetup(auth.companyId);
    await database.onboarding.update({ where: { companyId: auth.companyId }, data: { currentStep: 2 } });
    publish(auth.companyId, "mailbox.created", { id: mailbox.id });
    return reply.status(201).send(publicMailbox(mailbox));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/mailboxes/:id", async (request) => {
    const auth = await authenticate(request);
    const mailbox = await database.mailbox.findFirst({ where: { id: request.params.id, companyId: auth.companyId } });
    if (!mailbox) throw Object.assign(new Error("Casella non trovata"), { statusCode: 404 });
    const updated = await database.$transaction(async (transaction) => {
      if (request.body.isPrimary === true) await transaction.mailbox.updateMany({ where: { companyId: auth.companyId }, data: { isPrimary: false } });
      return transaction.mailbox.update({ where: { id: mailbox.id }, data: {
        isPrimary: request.body.isPrimary === true ? true : undefined,
        autoReply: typeof request.body.autoReply === "boolean" ? request.body.autoReply : undefined,
        enabled: typeof request.body.enabled === "boolean" ? request.body.enabled : undefined
      } });
    });
    if (updated.isPrimary) await database.company.update({ where: { id: auth.companyId }, data: { email: updated.email } });
    publish(auth.companyId, "mailbox.updated", { id: updated.id });
    return publicMailbox(updated);
  });

  app.get("/api/emails", async (request) => {
    const auth = await authenticate(request);
    const emails = await database.email.findMany({ where: { companyId: auth.companyId }, include: { mailbox: { select: { email: true } } }, orderBy: { receivedAt: "desc" }, take: 200 });
    return emails.map(publicEmail);
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/emails/:id/reply", async (request, reply) => {
    const auth = await authenticate(request);
    const original = await database.email.findFirst({ where: { id: request.params.id, companyId: auth.companyId } });
    if (!original) throw Object.assign(new Error("Email non trovata"), { statusCode: 404 });
    const mailbox = await database.mailbox.findFirst({ where: { companyId: auth.companyId, enabled: true, OR: [{ id: original.mailboxId ?? undefined }, { isPrimary: true }] }, orderBy: { isPrimary: "desc" } });
    if (!mailbox) throw Object.assign(new Error("Configurare una casella email principale"), { statusCode: 409 });
    const text = stringValue(request.body.text, "text");
    const subject = typeof request.body.subject === "string" && request.body.subject.trim() ? request.body.subject.trim() : `Re: ${original.subject}`;
    const messageId = await sendMailboxEmail(mailbox, { to: original.from, subject, text, inReplyTo: original.messageId });
    const sent = await database.$transaction(async (transaction) => {
      await transaction.email.update({ where: { id: original.id }, data: { status: "REPLIED", repliedAt: new Date() } });
      return transaction.email.create({ data: { companyId: auth.companyId, mailboxId: mailbox.id, messageId, from: mailbox.email, to: original.from, subject, text, category: original.category, priority: original.priority, direction: "OUTBOUND", status: "SENT", inReplyTo: original.messageId, sentAt: new Date() }, include: { mailbox: { select: { email: true } } } });
    });
    publish(auth.companyId, "email.sent", { id: sent.id });
    return reply.status(201).send(publicEmail(sent));
  });

  app.get("/api/internal/mailboxes", async (request) => {
    if (!process.env.INTERNAL_API_KEY || request.headers["x-internal-key"] !== process.env.INTERNAL_API_KEY) throw Object.assign(new Error("Chiave interna non valida"), { statusCode: 401 });
    if (!["127.0.0.1", "::1"].includes(request.ip)) throw Object.assign(new Error("Endpoint disponibile solo localmente"), { statusCode: 403 });
    const mailboxes = await database.mailbox.findMany({ where: { enabled: true } });
    return mailboxes.map((mailbox) => ({ ...publicMailbox(mailbox), companyId: mailbox.companyId, password: decryptMailboxPassword(mailbox.passwordEncrypted) }));
  });

  app.get("/api/system/status", async (request) => {
    const auth = await authenticate(request);
    await database.$queryRaw`SELECT 1`;
    const mailbox = await database.mailbox.findFirst({ where: { companyId: auth.companyId, enabled: true }, orderBy: { isPrimary: "desc" } });
    return { api: { status: "online", websocketClients: sockets.size }, email: { status: mailbox ? "configurato" : "non-configurato", host: mailbox?.imapHost ?? null, listener: "worker" }, ai: { status: "online", mode: "operativo", externalProvider: false }, database: { status: "online", mode: "postgresql" } };
  });

  const websocketRoute = app.get.bind(app) as unknown as (path: string, options: { websocket: true }, handler: (socket: LiveSocket, request: FastifyRequest) => void) => void;
  websocketRoute("/ws", { websocket: true }, async (socket, request) => {
    try {
      const token = new URL(request.url, "http://localhost").searchParams.get("token");
      if (!token) return socket.close();
      const session = await database.session.findUnique({ where: { tokenHash: tokenHash(token) } });
      if (!session || session.expiresAt <= new Date()) return socket.close();
      socket.companyId = session.companyId;
      sockets.add(socket);
      socket.send(JSON.stringify({ type: "connected", payload: { message: "Aggiornamenti live attivi" } }));
      socket.on("close", () => sockets.delete(socket));
    } catch { socket.close(); }
  });

  app.get("/api/overview", async (request) => {
    const auth = await authenticate(request);
    const [openTasks, activeCustomers, quoteAggregate, attendances, tasks, activities, quotes] = await Promise.all([
      database.task.count({ where: { companyId: auth.companyId, status: { not: "completato" } } }),
      database.customer.count({ where: { companyId: auth.companyId, status: "attivo" } }),
      database.quote.aggregate({ where: { companyId: auth.companyId, status: { not: "rifiutato" } }, _sum: { total: true } }),
      database.attendance.aggregate({ where: { employee: { companyId: auth.companyId } }, _sum: { hours: true } }),
      database.task.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" }, take: 5 }),
      database.activity.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" }, take: 8 }),
      database.quote.findMany({ where: { companyId: auth.companyId }, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 4 })
    ]);
    return { metrics: { openTasks, activeCustomers, pipelineValue: quoteAggregate._sum.total ?? 0, teamHours: attendances._sum.hours ?? 0 }, tasks: tasks.map(publicTask), activities: activities.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })), quotes: quotes.map(publicQuote) };
  });

  app.get("/api/customers", async (request) => {
    const auth = await authenticate(request);
    return (await database.customer.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" } })).map(publicCustomer);
  });

  app.post<{ Body: Record<string, unknown> }>("/api/customers", async (request, reply) => {
    const auth = await authenticate(request);
    const customer = await database.customer.create({ data: { companyId: auth.companyId, name: stringValue(request.body.name, "name"), companyName: stringValue(request.body.company ?? request.body.companyName, "company"), email: emailValue(request.body.email, "email"), phone: typeof request.body.phone === "string" ? request.body.phone : null, status: "attivo" } });
    publish(auth.companyId, "customer.created", customer);
    return reply.status(201).send(publicCustomer(customer));
  });

  app.get<{ Params: { id: string } }>("/api/customers/:id", async (request) => {
    const auth = await authenticate(request);
    const customer = await database.customer.findFirst({ where: { id: request.params.id, companyId: auth.companyId }, include: {
      emails: { orderBy: { receivedAt: "desc" }, take: 50 },
      tasks: { orderBy: { createdAt: "desc" }, take: 50 },
      quotes: { orderBy: { createdAt: "desc" }, take: 50 },
      orders: { orderBy: { createdAt: "desc" }, take: 50 },
      tickets: { orderBy: { createdAt: "desc" }, take: 50 }
    } });
    if (!customer) throw Object.assign(new Error("Cliente non trovato"), { statusCode: 404 });
    const timeline = [
      ...customer.emails.map((item) => ({ id: item.id, type: "email", title: item.subject, detail: item.direction, at: item.receivedAt })),
      ...customer.tasks.map((item) => ({ id: item.id, type: "task", title: item.title, detail: item.status, at: item.createdAt })),
      ...customer.quotes.map((item) => ({ id: item.id, type: "quote", title: `${item.number} · ${item.title}`, detail: item.status, at: item.createdAt })),
      ...customer.orders.map((item) => ({ id: item.id, type: "order", title: item.number, detail: item.status, at: item.createdAt })),
      ...customer.tickets.map((item) => ({ id: item.id, type: "ticket", title: item.title, detail: item.status, at: item.createdAt }))
    ].sort((left, right) => right.at.getTime() - left.at.getTime());
    return { ...publicCustomer(customer), preferences: customer.preferences, notes: customer.notes, tags: customer.tags, timeline };
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/customers/:id", async (request) => {
    const auth = await authenticate(request);
    const customer = await database.customer.findFirst({ where: { id: request.params.id, companyId: auth.companyId } });
    if (!customer) throw Object.assign(new Error("Cliente non trovato"), { statusCode: 404 });
    const preferences = request.body.preferences && typeof request.body.preferences === "object" ? request.body.preferences as Prisma.InputJsonValue : undefined;
    const updated = await database.customer.update({ where: { id: customer.id }, data: {
      name: typeof request.body.name === "string" && request.body.name.trim() ? request.body.name.trim() : undefined,
      companyName: typeof request.body.companyName === "string" && request.body.companyName.trim() ? request.body.companyName.trim() : undefined,
      phone: typeof request.body.phone === "string" ? request.body.phone.trim() || null : undefined,
      status: typeof request.body.status === "string" ? request.body.status : undefined,
      satisfaction: Number.isInteger(Number(request.body.satisfaction)) ? Number(request.body.satisfaction) : undefined,
      notes: typeof request.body.notes === "string" ? request.body.notes.trim() || null : undefined,
      tags: Array.isArray(request.body.tags) ? request.body.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim()) : undefined,
      preferences
    } });
    publish(auth.companyId, "customer.updated", { id: updated.id });
    return publicCustomer(updated);
  });

  app.get("/api/tickets", async (request) => {
    const auth = await authenticate(request);
    return database.ticket.findMany({ where: { companyId: auth.companyId }, include: { customer: { select: { name: true, companyName: true } } }, orderBy: { createdAt: "desc" } });
  });

  app.post<{ Body: Record<string, unknown> }>("/api/tickets", async (request, reply) => {
    const auth = await authenticate(request);
    const customerId = typeof request.body.customerId === "string" ? request.body.customerId : null;
    if (customerId && !await database.customer.findFirst({ where: { id: customerId, companyId: auth.companyId } })) throw Object.assign(new Error("Cliente non trovato"), { statusCode: 404 });
    const ticket = await database.ticket.create({ data: { companyId: auth.companyId, customerId, title: stringValue(request.body.title, "title"), description: typeof request.body.description === "string" ? request.body.description : null, priority: typeof request.body.priority === "string" ? request.body.priority : "MEDIUM" } });
    await database.activity.create({ data: { companyId: auth.companyId, type: "ticket", title: "Ticket creato", detail: ticket.title } });
    publish(auth.companyId, "ticket.created", ticket);
    return reply.status(201).send(ticket);
  });

  app.get("/api/orders", async (request) => {
    const auth = await authenticate(request);
    return database.order.findMany({ where: { companyId: auth.companyId }, include: { customer: true, quote: { select: { number: true, title: true } } }, orderBy: { createdAt: "desc" } });
  });

  app.get("/api/products", async (request) => {
    const auth = await authenticate(request);
    return database.product.findMany({ where: { companyId: auth.companyId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  });

  app.post<{ Body: Record<string, unknown> }>("/api/products", async (request, reply) => {
    const auth = await authenticate(request);
    const unitPrice = Number(request.body.unitPrice);
    const taxRate = Number(request.body.taxRate ?? 22);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0) throw Object.assign(new Error("Prezzo o IVA non validi"), { statusCode: 400 });
    const product = await database.product.create({ data: {
      companyId: auth.companyId,
      sku: stringValue(request.body.sku, "sku").toUpperCase(),
      name: stringValue(request.body.name, "name"),
      description: typeof request.body.description === "string" ? request.body.description.trim() || null : null,
      unit: typeof request.body.unit === "string" && request.body.unit.trim() ? request.body.unit.trim() : "cad.",
      unitPrice,
      taxRate
    } });
    publish(auth.companyId, "product.created", product);
    return reply.status(201).send(product);
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/products/:id", async (request) => {
    const auth = await authenticate(request);
    const product = await database.product.findFirst({ where: { id: request.params.id, companyId: auth.companyId } });
    if (!product) throw Object.assign(new Error("Voce di listino non trovata"), { statusCode: 404 });
    return database.product.update({ where: { id: product.id }, data: { active: typeof request.body.active === "boolean" ? request.body.active : undefined } });
  });

  app.get("/api/tasks", async (request) => {
    const auth = await authenticate(request);
    return (await database.task.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" } })).map(publicTask);
  });

  app.post<{ Body: Record<string, unknown> }>("/api/tasks", async (request, reply) => {
    const auth = await authenticate(request);
    const task = await database.task.create({ data: { companyId: auth.companyId, title: stringValue(request.body.title, "title"), owner: stringValue(request.body.owner, "owner"), status: "da-fare", priority: typeof request.body.priority === "string" ? request.body.priority : "media", dueAt: typeof request.body.dueAt === "string" ? new Date(request.body.dueAt) : new Date(Date.now() + 86400000) } });
    await database.activity.create({ data: { companyId: auth.companyId, type: "task", title: "Task creato", detail: task.title } });
    publish(auth.companyId, "task.created", task);
    return reply.status(201).send(publicTask(task));
  });

  app.get("/api/quotes", async (request) => {
    const auth = await authenticate(request);
    return (await database.quote.findMany({ where: { companyId: auth.companyId }, include: { customer: true }, orderBy: { createdAt: "desc" } })).map(publicQuote);
  });

  app.get<{ Params: { id: string } }>("/api/quotes/:id", async (request) => {
    const auth = await authenticate(request);
    const quote = await quoteWithRelations(auth.companyId, request.params.id);
    const { pdfData: _pdfData, ...details } = quote;
    return { ...details, ...publicQuote(quote) };
  });

  app.post<{ Body: Record<string, unknown> }>("/api/quotes", async (request, reply) => {
    const auth = await authenticate(request);
    const customerId = stringValue(request.body.customerId, "customerId");
    const customer = await database.customer.findFirst({ where: { id: customerId, companyId: auth.companyId } });
    if (!customer) throw Object.assign(new Error("Cliente non trovato"), { statusCode: 404 });
    const rawItems = Array.isArray(request.body.items) ? request.body.items : [];
    if (!rawItems.length) throw Object.assign(new Error("Inserire almeno una voce"), { statusCode: 400 });
    const requestedProductIds = rawItems.map((item) => (item as Record<string, unknown>).productId).filter((id): id is string => typeof id === "string" && Boolean(id));
    const products = await database.product.findMany({ where: { id: { in: requestedProductIds }, companyId: auth.companyId, active: true } });
    const productById = new Map(products.map((product) => [product.id, product]));
    const items = rawItems.map((item, index) => {
      const value = item as Record<string, unknown>;
      const quantity = Number(value.quantity);
      const product = typeof value.productId === "string" ? productById.get(value.productId) : undefined;
      if (value.productId && !product) throw Object.assign(new Error(`Voce ${index + 1}: prodotto non disponibile`), { statusCode: 400 });
      const unitPrice = product?.unitPrice ?? Number(value.unitPrice);
      const discountPercent = Number(value.discountPercent ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw Object.assign(new Error(`Voce ${index + 1} non valida`), { statusCode: 400 });
      return { description: product ? `${product.name}${product.description ? ` - ${product.description}` : ""}` : stringValue(value.description, `items.${index}.description`), quantity, unitPrice, discountPercent, total: Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100 };
    });
    const discountPercent = Number(request.body.discountPercent ?? 0);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw Object.assign(new Error("Sconto preventivo non valido"), { statusCode: 400 });
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.total, 0) * (1 - discountPercent / 100) * 100) / 100;
    const selectedTaxRates = products.map((product) => product.taxRate);
    const taxRate = selectedTaxRates.length && selectedTaxRates.every((rate) => rate === selectedTaxRates[0]) ? selectedTaxRates[0] : Number.isFinite(Number(request.body.taxRate)) ? Number(request.body.taxRate) : 22;
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const sequence = await database.quote.count({ where: { companyId: auth.companyId, createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } } });
    const number = `${new Date().getFullYear()}-${String(sequence + 1).padStart(4, "0")}`;
    const quote = await database.quote.create({ data: { companyId: auth.companyId, customerId, number, title: stringValue(request.body.title, "title"), subtotal, discountPercent, taxRate, taxAmount, total, notes: typeof request.body.notes === "string" ? request.body.notes : null, validUntil: typeof request.body.validUntil === "string" && request.body.validUntil ? new Date(request.body.validUntil) : null, followUpAt: typeof request.body.followUpAt === "string" && request.body.followUpAt ? new Date(request.body.followUpAt) : null, items: { create: items } }, include: { company: true, customer: true, items: true } });
    const pdf = await generateQuotePdf(quote);
    const saved = await database.quote.update({ where: { id: quote.id }, data: { pdfData: prismaBytes(pdf), pdfFilename: `preventivo-${number}.pdf` }, include: { customer: true } });
    await database.activity.create({ data: { companyId: auth.companyId, type: "quote", title: "Preventivo creato", detail: `${number} · ${customer.companyName}` } });
    publish(auth.companyId, "quote.created", saved);
    return reply.status(201).send(publicQuote(saved));
  });

  app.get<{ Params: { id: string } }>("/api/quotes/:id/pdf", async (request, reply) => {
    const auth = await authenticate(request);
    const quote = await quoteWithRelations(auth.companyId, request.params.id);
    const pdf = quote.pdfData ? Buffer.from(quote.pdfData) : await generateQuotePdf(quote);
    if (!quote.pdfData) await database.quote.update({ where: { id: quote.id }, data: { pdfData: prismaBytes(pdf), pdfFilename: `preventivo-${quote.number}.pdf` } });
    return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename="preventivo-${quote.number}.pdf"`).send(pdf);
  });

  app.post<{ Params: { id: string } }>("/api/quotes/:id/send", async (request) => {
    const auth = await authenticate(request);
    const quote = await quoteWithRelations(auth.companyId, request.params.id);
    const mailbox = await database.mailbox.findFirst({ where: { companyId: auth.companyId, enabled: true }, orderBy: { isPrimary: "desc" } });
    if (!mailbox) throw Object.assign(new Error("Configurare una casella email principale"), { statusCode: 409 });
    const pdf = quote.pdfData ? Buffer.from(quote.pdfData) : await generateQuotePdf(quote);
    const delivery = await sendQuoteEmail(quote, pdf, mailbox);
    const sent = await database.$transaction(async (transaction) => {
      await transaction.email.create({ data: { companyId: auth.companyId, mailboxId: mailbox.id, messageId: delivery.messageId, from: mailbox.email, to: quote.customer.email, subject: delivery.subject, text: delivery.text, category: "preventivo", priority: "media", direction: "OUTBOUND", status: "SENT", sentAt: new Date() } });
      return transaction.quote.update({ where: { id: quote.id }, data: { status: "inviato", sentAt: new Date(), pdfData: prismaBytes(pdf), pdfFilename: `preventivo-${quote.number}.pdf` }, include: { customer: true } });
    });
    await database.activity.create({ data: { companyId: auth.companyId, type: "quote", title: "Preventivo inviato", detail: `${quote.number} a ${quote.customer.email}` } });
    publish(auth.companyId, "quote.sent", sent);
    return publicQuote(sent);
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/quotes/:id", async (request) => {
    const auth = await authenticate(request);
    const quote = await database.quote.findFirst({ where: { id: request.params.id, companyId: auth.companyId } });
    if (!quote) throw Object.assign(new Error("Preventivo non trovato"), { statusCode: 404 });
    return database.quote.update({ where: { id: quote.id }, data: {
      notes: typeof request.body.notes === "string" ? request.body.notes : undefined,
      validUntil: typeof request.body.validUntil === "string" ? new Date(request.body.validUntil) : undefined,
      followUpAt: typeof request.body.followUpAt === "string" ? new Date(request.body.followUpAt) : undefined
    } });
  });

  app.post<{ Params: { id: string } }>("/api/quotes/:id/revise", async (request, reply) => {
    const auth = await authenticate(request);
    const original = await quoteWithRelations(auth.companyId, request.params.id);
    const revision = original.revision + 1;
    const number = `${original.number.split("-R")[0]}-R${revision}`;
    const quote = await database.quote.create({ data: {
      companyId: auth.companyId,
      customerId: original.customerId,
      parentQuoteId: original.id,
      number,
      title: original.title,
      status: "bozza",
      subtotal: original.subtotal,
      discountPercent: original.discountPercent,
      taxRate: original.taxRate,
      taxAmount: original.taxAmount,
      total: original.total,
      notes: original.notes,
      validUntil: original.validUntil,
      followUpAt: original.followUpAt,
      revision,
      items: { create: original.items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, discountPercent: item.discountPercent, total: item.total })) }
    }, include: { company: true, customer: true, items: true } });
    const pdf = await generateQuotePdf(quote);
    const saved = await database.quote.update({ where: { id: quote.id }, data: { pdfData: prismaBytes(pdf), pdfFilename: `preventivo-${number}.pdf` }, include: { customer: true } });
    await database.activity.create({ data: { companyId: auth.companyId, type: "quote", title: "Revisione preventivo creata", detail: number } });
    publish(auth.companyId, "quote.revised", saved);
    return reply.status(201).send(publicQuote(saved));
  });

  app.post<{ Params: { id: string } }>("/api/quotes/:id/approve", async (request) => {
    const auth = await authenticate(request);
    const quote = await database.quote.findFirst({ where: { id: request.params.id, companyId: auth.companyId }, include: { customer: true, order: true } });
    if (!quote) throw Object.assign(new Error("Preventivo non trovato"), { statusCode: 404 });
    if (quote.order) return { quote: publicQuote(quote), order: quote.order };
    const sequence = await database.order.count({ where: { companyId: auth.companyId, createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } } });
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(sequence + 1).padStart(4, "0")}`;
    const result = await database.$transaction(async (transaction) => {
      const approved = await transaction.quote.update({ where: { id: quote.id }, data: { status: "approvato", approvedAt: new Date() }, include: { customer: true } });
      const order = await transaction.order.create({ data: { companyId: auth.companyId, customerId: quote.customerId, quoteId: quote.id, number: orderNumber, total: quote.total } });
      await transaction.activity.create({ data: { companyId: auth.companyId, type: "order", title: "Preventivo convertito in ordine", detail: `${quote.number} → ${orderNumber}` } });
      return { quote: publicQuote(approved), order };
    });
    publish(auth.companyId, "quote.approved", result);
    return result;
  });

  app.get("/api/employees", async (request) => {
    const auth = await authenticate(request);
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const employees = await database.employee.findMany({ where: { companyId: auth.companyId }, include: { attendances: { where: { date: { gte: weekStart } }, orderBy: { date: "desc" } } }, orderBy: { createdAt: "desc" } });
    return employees.map((employee) => ({ ...employee, weeklyHours: employee.attendances.reduce((sum, item) => sum + item.hours, 0) }));
  });

  app.post<{ Body: Record<string, unknown> }>("/api/employees", async (request, reply) => {
    const auth = await authenticate(request);
    const employee = await database.employee.create({ data: { companyId: auth.companyId, name: stringValue(request.body.name, "name"), email: emailValue(request.body.email, "email"), role: stringValue(request.body.role, "role"), department: stringValue(request.body.department, "department") } });
    publish(auth.companyId, "employee.created", employee);
    return reply.status(201).send(employee);
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/employees/:id/attendance", async (request, reply) => {
    const auth = await authenticate(request);
    const employee = await database.employee.findFirst({ where: { id: request.params.id, companyId: auth.companyId } });
    if (!employee) throw Object.assign(new Error("Dipendente non trovato"), { statusCode: 404 });
    const date = typeof request.body.date === "string" ? new Date(request.body.date) : new Date();
    const checkIn = typeof request.body.checkIn === "string" ? new Date(request.body.checkIn) : null;
    const checkOut = typeof request.body.checkOut === "string" ? new Date(request.body.checkOut) : null;
    const calculatedHours = checkIn && checkOut ? (checkOut.getTime() - checkIn.getTime()) / 3600000 : Number(request.body.hours);
    if (!Number.isFinite(calculatedHours) || calculatedHours < 0 || calculatedHours > 24) throw Object.assign(new Error("Ore di presenza non valide"), { statusCode: 400 });
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const attendance = await database.attendance.upsert({ where: { employeeId_date: { employeeId: employee.id, date: day } }, create: { employeeId: employee.id, date: day, hours: Math.round(calculatedHours * 100) / 100, checkIn, checkOut, note: typeof request.body.note === "string" ? request.body.note : null }, update: { hours: Math.round(calculatedHours * 100) / 100, checkIn, checkOut, note: typeof request.body.note === "string" ? request.body.note : undefined } });
    publish(auth.companyId, "attendance.recorded", { employeeId: employee.id, attendanceId: attendance.id });
    return reply.status(201).send(attendance);
  });

  app.get("/api/hr/reports", async (request) => {
    const auth = await authenticate(request);
    return database.report.findMany({ where: { companyId: auth.companyId, type: "ATTENDANCE_WEEKLY" }, orderBy: { createdAt: "desc" }, take: 24 });
  });

  app.post("/api/hr/reports/weekly", async (request, reply) => {
    const auth = await authenticate(request);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 7);
    const employees = await database.employee.findMany({ where: { companyId: auth.companyId }, include: { attendances: { where: { date: { gte: periodStart, lte: periodEnd } } } } });
    const rows = employees.map((employee) => ({ employeeId: employee.id, name: employee.name, hours: employee.attendances.reduce((sum, item) => sum + item.hours, 0), days: employee.attendances.length }));
    const report = await database.report.create({ data: { companyId: auth.companyId, type: "ATTENDANCE_WEEKLY", periodStart, periodEnd, data: { rows, totalHours: rows.reduce((sum, row) => sum + row.hours, 0) } } });
    await database.activity.create({ data: { companyId: auth.companyId, type: "report", title: "Report presenze generato", detail: `${rows.length} dipendenti · ${rows.reduce((sum, row) => sum + row.hours, 0)} ore` } });
    publish(auth.companyId, "report.created", report);
    return reply.status(201).send(report);
  });

  app.post<{ Body: { subject?: string; text?: string } }>("/api/ai/analyze-email", async (request) => {
    const auth = await authenticate(request);
    const decision = analyzeEmail(request.body.subject ?? "", request.body.text ?? "");
    publish(auth.companyId, "email.analyzed", decision);
    return decision;
  });

  app.get("/api/automations", async (request) => {
    const auth = await authenticate(request);
    await ensureCommercialSetup(auth.companyId);
    return database.automationRuleRecord.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "asc" } });
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/automations/:id", async (request) => {
    const auth = await authenticate(request);
    const rule = await database.automationRuleRecord.findFirst({ where: { id: request.params.id, companyId: auth.companyId } });
    if (!rule) throw Object.assign(new Error("Automazione non trovata"), { statusCode: 404 });
    const updated = await database.automationRuleRecord.update({ where: { id: rule.id }, data: { enabled: typeof request.body.enabled === "boolean" ? request.body.enabled : undefined, name: typeof request.body.name === "string" && request.body.name.trim() ? request.body.name.trim() : undefined } });
    publish(auth.companyId, "automation.updated", updated);
    return updated;
  });

  app.post<{ Body: Record<string, unknown> }>("/api/emails/process", async (request, reply) => {
    const subject = stringValue(request.body.subject, "subject");
    const text = stringValue(request.body.text, "text");
    const from = stringValue(request.body.from, "from");
    const recipient = typeof request.body.to === "string" ? request.body.to : undefined;
    const companyId = await resolveEmailCompany(request, recipient);
    const mailbox = recipient ? await database.mailbox.findFirst({ where: { companyId, email: { equals: recipient, mode: "insensitive" } } }) : null;
    const messageId = typeof request.body.messageId === "string" && request.body.messageId.trim() ? request.body.messageId.trim() : crypto.randomUUID();
    const existingEmail = await database.email.findUnique({ where: { companyId_messageId: { companyId, messageId } } });
    if (existingEmail) return reply.send({ duplicate: true, emailId: existingEmail.id });
    const decision = analyzeEmail(subject, text);
    const executions = await automationExecutions(companyId, "email.received");
    const email = await database.email.create({ data: { companyId, mailboxId: mailbox?.id, messageId, from, to: recipient ?? "", subject, text, category: decision.category, priority: decision.priority, direction: "INBOUND", status: "RECEIVED" } });
    const task = await database.task.create({ data: { companyId, title: subject, description: text, owner: decision.department, status: "da-fare", priority: decision.priority, dueAt: new Date(Date.now() + (decision.priority === "urgente" ? 3600000 : 86400000)) } });
    const activity = await database.activity.create({ data: { companyId, type: "email", title: "Email elaborata", detail: `${from} · ${decision.category} · ${decision.department}` } });
    const isImapMessage = !request.headers.authorization && request.headers["x-internal-key"] === process.env.INTERNAL_API_KEY;
    const canAutoReply = isImapMessage && mailbox?.autoReply && !subject.toLowerCase().startsWith("re:") && !from.toLowerCase().includes(mailbox.email.toLowerCase());
    let automation: Awaited<ReturnType<typeof automateQuoteRequest>> | { kind: "failed"; error: string } | null = null;
    if (canAutoReply && decision.category === "preventivo") {
      try {
        automation = await automateQuoteRequest({ companyId, mailbox, email, task });
      } catch (automationError) {
        const errorMessage = automationError instanceof Error ? automationError.message : "Errore automazione preventivo";
        automation = { kind: "failed", error: errorMessage };
        await database.$transaction([
          database.email.update({ where: { id: email.id }, data: { status: "AUTOMATION_FAILED" } }),
          database.activity.create({ data: { companyId, type: "quote", title: "Automazione preventivo non completata", detail: `${from} · ${errorMessage}` } })
        ]);
      }
    } else if (canAutoReply) {
      const replyText = `Buongiorno,\n\nabbiamo ricevuto la sua richiesta: "${subject}". È stata presa in carico dal reparto ${decision.department}.\n\nCordiali saluti,\n${mailbox.displayName ?? mailbox.email}`;
      const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
      const messageId = await sendMailboxEmail(mailbox, { to: from, subject: replySubject, text: replyText, inReplyTo: email.messageId });
      await database.$transaction([
        database.email.update({ where: { id: email.id }, data: { status: "REPLIED", repliedAt: new Date() } }),
        database.email.create({ data: { companyId, mailboxId: mailbox.id, messageId, from: mailbox.email, to: from, subject: replySubject, text: replyText, category: decision.category, priority: decision.priority, direction: "OUTBOUND", status: "SENT", inReplyTo: email.messageId, sentAt: new Date() } })
      ]);
      publish(companyId, "email.auto-replied", { emailId: email.id });
    }
    const result = { decision, executions, task: publicTask(task), activity, emailId: email.id, automation };
    publish(companyId, "email.processed", result);
    return reply.status(201).send(result);
  });

  return app;
}

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "127.0.0.1";
const app = await buildServer();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}