"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Bot, BriefcaseBusiness, Building2, CheckCircle2, CircleDollarSign, Clock3, Download,
  Inbox, LayoutDashboard, LockKeyhole, LogOut, Mail, Menu, Plus, RefreshCw, Search, Send, Settings, Sparkles, Users, X, Zap
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:4000");

type View = "overview" | "plans" | "tasks" | "customers" | "products" | "quotes" | "team" | "email" | "ai";
interface Task { id: string; title: string; owner: string; status: string; priority: string; dueAt: string }
interface Customer { id: string; name: string; company: string; email: string; status: string; satisfaction: number }
interface Quote { id: string; number: string; customer: string; title: string; amount: number; status: string; createdAt: string; sentAt?: string | null }
interface Employee { id: string; name: string; role: string; department: string; weeklyHours: number; status: string }
interface ActivityItem { id: string; type: string; title: string; detail: string; createdAt: string }
interface Overview {
  metrics: { openTasks: number; activeCustomers: number; pipelineValue: number; teamHours: number };
  tasks: Task[];
  activities: ActivityItem[];
  quotes: Quote[];
}
interface Decision { category: string; priority: string; department: string; actions: string[] }
interface EmailTestResult { decision: Decision; executions: Array<{ ruleId: string; action: string }>; task: Task }
interface SystemStatus {
  api: { status: string; websocketClients: number };
  email: { status: string; host: string | null; listener: string };
  ai: { status: string; mode: string; externalProvider: boolean };
  database: { status: string; mode: string };
  billing: { status: string; provider: string; environment: string };
}
interface Mailbox { id: string; email: string; displayName: string | null; imapHost: string; smtpHost: string; isPrimary: boolean; autoReply: boolean; enabled: boolean }
interface EmailMessage { id: string; messageId: string; from: string; to: string; subject: string; text: string; category: string; priority: string; direction: "INBOUND" | "OUTBOUND"; status: string; receivedAt: string; sentAt: string | null; repliedAt: string | null; mailbox: string | null }
interface Account { user: { name: string; email: string; role: string }; company: { name: string; email: string; vatNumber: string | null; phone: string | null; address: string | null; city: string | null; postalCode: string | null; logoData: string | null } }
interface Product { id: string; sku: string; name: string; description: string | null; unit: string; unitPrice: number; taxRate: number; active: boolean }
interface SaaSPlan { code: string; audience: string; name: string; description: string; monthlyPriceCents: number; setupPriceCents: number; capacity: string; highlighted: boolean; limits: { mailboxes: number; users: number | null; monthlyEmails: number }; features: string[] }
interface Subscription { id: string; planCode: string; status: string; trialEndsAt: string | null; currentPeriodEndsAt: string | null; paypalPlanId: string | null; paypalSubscriptionId: string | null; paypalPayerId: string | null; cancelAtPeriodEnd: boolean }
interface OnboardingState { onboarding: { currentStep: number; completed: boolean; modules: Record<string, boolean> }; aiConfiguration: { tone: string; language: string; signature: string | null; instructions: string | null; autoReplyEnabled: boolean; confidenceThreshold: number }; mailboxConnected: boolean; steps: Array<{ id: string; label: string; completed: boolean }> }
interface AutomationRule { id: string; name: string; trigger: string; actions: string[]; enabled: boolean }
interface CustomerDetail extends Customer { notes: string | null; tags: string[]; preferences: Record<string, unknown>; timeline: Array<{ id: string; type: string; title: string; detail: string; at: string }> }

const navigation = [
  { id: "overview" as const, label: "Panoramica", icon: LayoutDashboard },
  { id: "plans" as const, label: "Piano SaaS", icon: Building2 },
  { id: "tasks" as const, label: "Attività", icon: CheckCircle2 },
  { id: "customers" as const, label: "Clienti", icon: BriefcaseBusiness },
  { id: "products" as const, label: "Listino", icon: CircleDollarSign },
  { id: "quotes" as const, label: "Preventivi", icon: CircleDollarSign },
  { id: "team" as const, label: "Personale", icon: Users }
];
const automationNavigation = [
  { id: "email" as const, label: "Email engine", icon: Mail },
  { id: "ai" as const, label: "AI orchestrator", icon: Sparkles }
];

function currency(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "ora";
  if (minutes < 60) return `${minutes} min fa`;
  return `${Math.floor(minutes / 60)} h fa`;
}

async function prepareLogo(file: File) {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/)) throw new Error("Formato logo non supportato");
  const bitmap = await createImageBitmap(file);
  const size = 320;
  const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossibile elaborare il logo");
  context.clearRect(0, 0, size, size);
  context.drawImage(bitmap, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.88);
}

function CompanyMark({ company }: { company?: { name: string; logoData: string | null } }) {
  if (company?.logoData) return <span className="company-mark"><img src={company.logoData} alt={`Logo ${company.name}`} /></span>;
  const initials = company?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AO";
  return <span className="brand-mark">{initials}</span>;
}

export default function Dashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [planAction, setPlanAction] = useState<string | null>(null);
  const [emailFolder, setEmailFolder] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [emailResult, setEmailResult] = useState<EmailTestResult | null>(null);
  const [aiResult, setAiResult] = useState<Decision | null>(null);
  const [testing, setTesting] = useState<"email" | "ai" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteAction, setQuoteAction] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [mailboxDialogOpen, setMailboxDialogOpen] = useState(false);
  const [replyEmail, setReplyEmail] = useState<EmailMessage | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [attendanceEmployee, setAttendanceEmployee] = useState<Employee | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [brandingPending, setBrandingPending] = useState(false);

  function apiFetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  }

  async function loadData() {
    setLoading(true);
    try {
      const responses = await Promise.all([
        apiFetch("/api/overview"), apiFetch("/api/tasks"), apiFetch("/api/customers"),
        apiFetch("/api/quotes"), apiFetch("/api/employees"), apiFetch("/api/system/status"), apiFetch("/api/auth/me"), apiFetch("/api/mailboxes"), apiFetch("/api/emails"), apiFetch("/api/products"), apiFetch("/api/plans"), apiFetch("/api/subscription"), apiFetch("/api/onboarding"), apiFetch("/api/automations")
      ]);
      if (responses.some((response) => response.status === 401)) { logout(false); return; }
      if (responses.some((response) => !response.ok)) throw new Error("API o database non disponibile");
      const [overviewData, taskData, customerData, quoteData, employeeData, statusData, accountData, mailboxData, emailData, productData, planData, subscriptionData, onboardingData, automationData] = await Promise.all(responses.map((response) => response.json()));
      setOverview(overviewData); setTasks(taskData); setCustomers(customerData); setQuotes(quoteData); setEmployees(employeeData); setSystemStatus(statusData); setAccount(accountData); setMailboxes(mailboxData); setEmails(emailData); setProducts(productData); setPlans(planData); setSubscription(subscriptionData.subscription); setOnboarding(onboardingData); setAutomationRules(automationData); setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore di caricamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setToken(localStorage.getItem("ai-office-token"));
    if (new URLSearchParams(window.location.search).has("checkout")) {
      setView("plans");
      window.history.replaceState({}, "", window.location.pathname);
    }
    setAuthReady(true);
  }, []);
  useEffect(() => { if (token) void loadData(); }, [token]);
  useEffect(() => {
    if (!token) return;
    const socketOrigin = API_URL ? API_URL.replace(/^http/, "ws") : window.location.origin.replace(/^http/, "ws");
    const socket = new WebSocket(`${socketOrigin}/ws?token=${encodeURIComponent(token)}`);
    socket.onopen = () => setLive(true);
    socket.onclose = () => setLive(false);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string };
      if (message.type !== "connected") void loadData();
    };
    return () => socket.close();
  }, [token]);

  function authenticated(nextToken: string) {
    localStorage.setItem("ai-office-token", nextToken);
    setToken(nextToken);
  }

  async function logout(callApi = true) {
    if (callApi && token) await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("ai-office-token");
    setToken(null); setAccount(null); setOverview(null); setLoading(true);
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await apiFetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: data.get("title"), owner: data.get("owner"), priority: data.get("priority") })
    });
    if (!response.ok) { setError("Impossibile creare l'attività"); return; }
    setDialogOpen(false);
    await loadData();
  }

  async function testEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTesting("email");
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/emails/process", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: data.get("from"), subject: data.get("subject"), text: data.get("text") })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Test email fallito");
      setEmailResult(result); setError("");
      await loadData();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Test email fallito");
    } finally { setTesting(null); }
  }

  async function testAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTesting("ai");
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/ai/analyze-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: data.get("subject"), text: data.get("text") })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Analisi AI fallita");
      setAiResult(result); setError("");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Analisi AI fallita");
    } finally { setTesting(null); }
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuoteAction("create");
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: data.get("customerId"), title: data.get("title"), taxRate: Number(data.get("taxRate")), discountPercent: Number(data.get("discountPercent")), validUntil: data.get("validUntil"), followUpAt: data.get("followUpAt"), notes: data.get("notes"), items: [{ productId: data.get("productId") || undefined, description: data.get("description"), quantity: Number(data.get("quantity")), unitPrice: Number(data.get("unitPrice")), discountPercent: Number(data.get("itemDiscountPercent")) }] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Creazione preventivo fallita");
      setQuoteDialogOpen(false); setError(""); await loadData();
    } catch (quoteError) { setError(quoteError instanceof Error ? quoteError.message : "Creazione preventivo fallita"); }
    finally { setQuoteAction(null); }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), company: data.get("company"), email: data.get("email"), phone: data.get("phone") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Creazione cliente fallita");
      setCustomerDialogOpen(false); setError(""); await loadData();
    } catch (customerError) { setError(customerError instanceof Error ? customerError.message : "Creazione cliente fallita"); }
  }

  async function openCustomer(customer: Customer) {
    const response = await apiFetch(`/api/customers/${customer.id}`);
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Scheda cliente non disponibile"); return; }
    setCustomerDetail(result);
  }

  async function saveCustomerDetail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerDetail) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await apiFetch(`/api/customers/${customerDetail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: data.notes, tags: String(data.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean), preferences: { communication: data.communication } }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Aggiornamento cliente fallito"); return; }
    setCustomerDetail(null); await loadData();
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerDetail) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const response = await apiFetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: customerDetail.id, title: data.title, description: data.description, priority: data.priority }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Creazione ticket fallita"); return; }
    form.reset(); await openCustomer(customerDetail);
  }

  async function updateBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    setBrandingPending(true);
    const formData = new FormData(event.currentTarget);
    const logoFile = formData.get("logo");
    try {
      const logoData = logoFile instanceof File && logoFile.size ? await prepareLogo(logoFile) : undefined;
      const response = await apiFetch("/api/company", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name"), logoData }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Aggiornamento brand fallito");
      setAccount({ ...account, company: result }); setError("");
    } catch (brandingError) { setError(brandingError instanceof Error ? brandingError.message : "Aggiornamento brand fallito"); }
    finally { setBrandingPending(false); }
  }

  async function downloadQuote(quote: Quote) {
    setQuoteAction(quote.id);
    try {
      const response = await apiFetch(`/api/quotes/${quote.id}/pdf`);
      if (!response.ok) throw new Error("PDF non disponibile");
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (quoteError) { setError(quoteError instanceof Error ? quoteError.message : "Download fallito"); }
    finally { setQuoteAction(null); }
  }

  async function sendQuote(quote: Quote) {
    setQuoteAction(quote.id);
    try {
      const response = await apiFetch(`/api/quotes/${quote.id}/send`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Invio fallito");
      setError(""); await loadData();
    } catch (quoteError) { setError(quoteError instanceof Error ? quoteError.message : "Invio fallito"); }
    finally { setQuoteAction(null); }
  }

  async function quoteWorkflow(quote: Quote, action: "revise" | "approve") {
    setQuoteAction(quote.id);
    const response = await apiFetch(`/api/quotes/${quote.id}/${action}`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Operazione sul preventivo fallita");
    else { setError(""); await loadData(); }
    setQuoteAction(null);
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await apiFetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Creazione dipendente fallita"); return; }
    setEmployeeDialogOpen(false); await loadData();
  }

  async function recordAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attendanceEmployee) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await apiFetch(`/api/employees/${attendanceEmployee.id}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: data.date, hours: Number(data.hours), note: data.note }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Registrazione presenza fallita"); return; }
    setAttendanceEmployee(null); await loadData();
  }

  async function generateHrReport() {
    const response = await apiFetch("/api/hr/reports/weekly", { method: "POST" });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Generazione report fallita"); return; }
    setError(""); await loadData();
  }

  async function createMailbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await apiFetch("/api/mailboxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, imapPort: Number(data.imapPort), smtpPort: Number(data.smtpPort), isPrimary: data.isPrimary === "on", autoReply: data.autoReply === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Connessione alla casella fallita");
      setMailboxDialogOpen(false); setError(""); await loadData();
    } catch (mailboxError) { setError(mailboxError instanceof Error ? mailboxError.message : "Configurazione casella fallita"); }
  }

  async function updateMailbox(mailbox: Mailbox, values: Partial<Mailbox>) {
    const response = await apiFetch(`/api/mailboxes/${mailbox.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (!response.ok) { setError("Aggiornamento casella fallito"); return; }
    await loadData();
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!replyEmail) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await apiFetch(`/api/emails/${replyEmail.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Invio risposta fallito"); return; }
    setReplyEmail(null); setError(""); await loadData();
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await apiFetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, unitPrice: Number(data.unitPrice), taxRate: Number(data.taxRate) }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Creazione voce fallita"); return; }
    setProductDialogOpen(false); setError(""); await loadData();
  }

  async function toggleProduct(product: Product) {
    const response = await apiFetch(`/api/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !product.active }) });
    if (!response.ok) { setError("Aggiornamento listino fallito"); return; }
    await loadData();
  }

  async function selectPlan(plan: SaaSPlan) {
    setPlanAction(plan.code);
    try {
      const response = await apiFetch("/api/subscription/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planCode: plan.code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Avvio pagamento fallito");
      window.location.assign(result.url);
    } catch (planError) { setError(planError instanceof Error ? planError.message : "Attivazione piano fallita"); }
    finally { setPlanAction(null); }
  }

  async function manageSubscription() {
    setPlanAction("portal");
    try {
      const response = await apiFetch("/api/subscription/portal", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Apertura portale fallita");
      window.location.assign(result.url);
    } catch (portalError) { setError(portalError instanceof Error ? portalError.message : "Apertura portale fallita"); }
    finally { setPlanAction(null); }
  }

  async function saveOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const modules = { crm: data.crm === "on", quotes: data.quotes === "on", hr: data.hr === "on", automations: data.automations === "on" };
    const response = await apiFetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tone: data.tone, signature: data.signature, instructions: data.instructions, autoReplyEnabled: data.autoReplyEnabled === "on", confidenceThreshold: Number(data.confidenceThreshold), modules }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Configurazione AI fallita"); return; }
    if (onboarding?.mailboxConnected) {
      const completion = await apiFetch("/api/onboarding/complete", { method: "POST" });
      const completionResult = await completion.json();
      if (!completion.ok) { setError(completionResult.error ?? "Completamento onboarding fallito"); return; }
    } else {
      setMailboxDialogOpen(true);
    }
    setError(""); await loadData();
  }

  async function toggleAutomation(rule: AutomationRule) {
    const response = await apiFetch(`/api/automations/${rule.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !rule.enabled }) });
    if (!response.ok) { setError("Aggiornamento automazione fallito"); return; }
    await loadData();
  }

  const title = [...navigation, ...automationNavigation].find((item) => item.id === view)?.label ?? "Panoramica";

  if (!authReady) return <div className="loading"><RefreshCw size={24} />Avvio applicazione...</div>;
  if (!token) return <AuthScreen onAuthenticated={authenticated} />;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand"><CompanyMark company={account?.company} /><div><strong>{account?.company.name ?? "AI Office"}</strong><small>AI Office Manager</small></div></div>
        <button className="icon-button sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Chiudi menu"><X size={20} /></button>
        <nav aria-label="Navigazione principale">
          <p className="nav-label">Spazio di lavoro</p>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => { setView(id); setMobileMenu(false); }}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
          <p className="nav-label nav-secondary">Automazioni</p>
          {automationNavigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => { setView(id); setMobileMenu(false); }}>
              <Icon size={19} /><span>{label}</span>{id === "email" && <i className="status-dot" />}
            </button>
          ))}
        </nav>
        {account && <div className="account-block"><button className="account-details" onClick={() => setAccountDialogOpen(true)}><Building2 size={18} /><span><strong>{account.company.name}</strong><small>{account.user.name}</small></span></button><button onClick={() => void logout()} title="Esci" aria-label="Esci"><LogOut size={16} /></button></div>}
        <div className="sidebar-status"><span className={live ? "pulse online" : "pulse"} /><div><strong>{live ? "Sistema operativo" : "Connessione assente"}</strong><small>{live ? "PostgreSQL e aggiornamenti live" : "Controlla l'API"}</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Apri menu"><Menu size={21} /></button>
          <div><p className="eyebrow">Centro operativo</p><h1>{title}</h1></div>
          <div className="top-actions">
            <label className="search"><Search size={17} /><input aria-label="Cerca" placeholder="Cerca nel workspace" /></label>
            <button className="icon-button" onClick={() => void loadData()} title="Aggiorna" aria-label="Aggiorna"><RefreshCw size={18} /></button>
            <button className="primary-button" onClick={() => setDialogOpen(true)}><Plus size={18} />Nuova attività</button>
          </div>
        </header>

        {error && <div className="error-banner">{error}<button onClick={() => void loadData()}>Riprova</button></div>}
        {loading && !overview ? <div className="loading"><RefreshCw size={24} />Sincronizzazione dati...</div> : null}

        {!loading && view === "overview" && overview && (
          <div className="view-content reveal">
            {onboarding && !onboarding.onboarding.completed && <section className="onboarding-panel"><div className="onboarding-intro"><span className="onboarding-kicker"><Zap size={14} /> Setup intelligente</span><p className="eyebrow">Avvio guidato</p><h2>Il tuo ufficio AI, operativo in pochi minuti.</h2><p className="onboarding-copy">Scegli cosa automatizzare, definisci la voce dell'assistente e collega la casella aziendale.</p><div className="onboarding-steps">{onboarding.steps.map((step, index) => <span className={step.completed ? "done" : ""} key={step.id}><b>{step.completed ? <CheckCircle2 size={15} /> : index + 1}</b><i><strong>{step.label}</strong><small>{step.completed ? "Completato" : index === 1 ? "Connessione sicura IMAP/SMTP" : "Da configurare"}</small></i></span>)}</div></div><form onSubmit={saveOnboarding}><div className="onboarding-form-head"><div><p className="eyebrow">Personalizza l'assistente</p><h3>Come deve lavorare?</h3></div><Bot size={22} /></div><div className="module-picker"><label><input name="crm" type="checkbox" defaultChecked={onboarding.onboarding.modules.crm !== false} /><span><BriefcaseBusiness size={17} /><b>CRM</b></span></label><label><input name="quotes" type="checkbox" defaultChecked={onboarding.onboarding.modules.quotes !== false} /><span><CircleDollarSign size={17} /><b>Preventivi</b></span></label><label><input name="hr" type="checkbox" defaultChecked={onboarding.onboarding.modules.hr !== false} /><span><Users size={17} /><b>HR</b></span></label><label><input name="automations" type="checkbox" defaultChecked={onboarding.onboarding.modules.automations !== false} /><span><Zap size={17} /><b>Automazioni</b></span></label></div><div className="onboarding-fields"><label>Tono<select name="tone" defaultValue={onboarding.aiConfiguration.tone}><option value="professionale">Professionale</option><option value="cordiale">Cordiale</option><option value="diretto">Diretto</option></select></label><label>Firma<input name="signature" defaultValue={onboarding.aiConfiguration.signature ?? account?.company.name ?? ""} /></label><label className="wide-field">Istruzioni<textarea name="instructions" defaultValue={onboarding.aiConfiguration.instructions ?? "Rispondi con chiarezza e non inventare prezzi."} /></label></div><label className="automation-choice"><input name="autoReplyEnabled" type="checkbox" defaultChecked={onboarding.aiConfiguration.autoReplyEnabled} /><span><b>Risposte email automatiche</b><small>Verranno attivate sulla casella verificata al termine.</small></span></label><input name="confidenceThreshold" type="hidden" value="0.85" /><button className="onboarding-submit" type="submit"><span>{onboarding.mailboxConnected ? "Completa configurazione" : "Continua e collega l'email"}</span><ArrowRight size={18} /></button></form></section>}
            <section className="metric-grid" aria-label="Indicatori principali">
              <article><div className="metric-icon coral"><CheckCircle2 /></div><p>Attività aperte</p><strong>{overview.metrics.openTasks}</strong><small>priorità operative</small></article>
              <article><div className="metric-icon green"><BriefcaseBusiness /></div><p>Clienti attivi</p><strong>{overview.metrics.activeCustomers}</strong><small>portafoglio corrente</small></article>
              <article><div className="metric-icon gold"><CircleDollarSign /></div><p>Valore pipeline</p><strong>{currency(overview.metrics.pipelineValue)}</strong><small>preventivi aperti</small></article>
              <article><div className="metric-icon blue"><Clock3 /></div><p>Ore del team</p><strong>{overview.metrics.teamHours}</strong><small>settimana corrente</small></article>
            </section>

            <div className="overview-grid">
              <section className="panel task-panel"><div className="section-heading"><div><p className="eyebrow">Flusso di lavoro</p><h2>Priorità di oggi</h2></div><button onClick={() => setView("tasks")}>Vedi tutte</button></div><TaskTable tasks={overview.tasks} /></section>
              <section className="panel activity-panel"><div className="section-heading"><div><p className="eyebrow">In tempo reale</p><h2>Attività recenti</h2></div><Activity size={19} /></div><div className="activity-list">{overview.activities.map((item) => <div className="activity-row" key={item.id}><span className={`activity-symbol ${item.type}`}><Activity size={15} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{relativeTime(item.createdAt)}</time></div>)}</div></section>
            </div>

            <section className="panel"><div className="section-heading"><div><p className="eyebrow">Commerciale</p><h2>Pipeline preventivi</h2></div><button onClick={() => setView("quotes")}>Apri pipeline</button></div><QuoteTable quotes={overview.quotes} /></section>
          </div>
        )}

        {!loading && view === "plans" && <div className="view-content reveal">
          <PageIntro title="Scegli il piano SaaS" text="Quattro configurazioni dimensionate sul volume di lavoro. Canone e installazione restano sempre separati e trasparenti." />
          {systemStatus?.billing.status !== "configurato" && <div className="billing-warning"><Settings size={18} /><div><strong>PayPal Sandbox da configurare</strong><span>Inserisci Client ID, Secret e Webhook ID nell'ambiente server per attivare checkout e rinnovi.</span></div></div>}
          {subscription && <div className="subscription-banner"><CheckCircle2 size={18} /><div><strong>Piano: {plans.find((plan) => plan.code === subscription.planCode)?.name ?? subscription.planCode}</strong><span>{subscription.status === "TRIALING" && subscription.trialEndsAt ? `Prova fino al ${new Intl.DateTimeFormat("it-IT").format(new Date(subscription.trialEndsAt))}` : subscription.status}{subscription.cancelAtPeriodEnd ? " · Cancellazione a fine periodo" : ""}</span></div>{subscription.paypalSubscriptionId && <button className="secondary-button" disabled={planAction !== null} onClick={() => void manageSubscription()}><Settings size={16} />{planAction === "portal" ? "Apertura..." : "Gestisci su PayPal"}</button>}</div>}
          <section className="pricing-grid">{plans.map((plan) => { const selected = subscription?.planCode === plan.code; const paypalConfigured = systemStatus?.billing.status === "configurato"; const paypalActive = Boolean(subscription?.paypalSubscriptionId) && ["ACTIVE", "TRIALING", "PAST_DUE", "SUSPENDED"].includes(subscription?.status ?? ""); return <article className={`pricing-card ${plan.highlighted ? "featured" : ""} ${selected ? "selected" : ""}`} key={plan.code}>{plan.highlighted && <span className="plan-ribbon">Più scelto</span>}<p className="plan-audience">{plan.audience}</p><h2>{plan.name}</h2><p className="plan-description">{plan.description}</p><div className="plan-price"><strong>{currency(plan.monthlyPriceCents / 100)}</strong><span>/ mese</span></div><div className="setup-price"><span>Installazione</span><strong>{currency(plan.setupPriceCents / 100)}</strong></div><p className="plan-capacity">{plan.capacity}</p><ul>{plan.features.map((feature) => <li key={feature}><CheckCircle2 size={15} />{feature}</li>)}</ul><div className="plan-limits"><span>{plan.limits.monthlyEmails.toLocaleString("it-IT")} email/mese</span><span>{plan.limits.users ?? "Illimitati"} {plan.limits.users === 1 ? "utente" : "utenti"}</span></div><button className={plan.highlighted ? "primary-button" : "secondary-button"} disabled={!paypalConfigured || paypalActive || planAction !== null} onClick={() => void selectPlan(plan)}><CircleDollarSign size={16} />{!paypalConfigured ? "PayPal da configurare" : paypalActive ? selected ? "Piano attivo" : "Gestisci su PayPal" : planAction === plan.code ? "Apertura PayPal..." : selected ? "Completa su PayPal" : "Prova 14 giorni con PayPal"}</button></article>; })}</section>
          <p className="pricing-note">Abbonamenti e pagamenti sono gestiti da PayPal. Le ore indicate sono una stima di capacità operativa recuperabile, non una garanzia di guadagno.</p>
        </div>}

        {!loading && view === "tasks" && <div className="view-content reveal"><PageIntro title="Attività operative" text="Lavoro assegnato ai reparti, ordinato per priorità e scadenza." action={() => setDialogOpen(true)} actionLabel="Nuova attività" /><section className="panel"><TaskTable tasks={tasks} /></section></div>}
        {!loading && view === "customers" && <div className="view-content reveal"><PageIntro title="Portafoglio clienti" text="Profili, preferenze e timeline commerciale unificata." action={() => setCustomerDialogOpen(true)} actionLabel="Nuovo cliente" />{customers.length ? <section className="data-grid">{customers.map((customer) => <button className="customer-row customer-button" key={customer.id} onClick={() => void openCustomer(customer)}><div className="avatar">{customer.name.split(" ").map((part) => part[0]).join("")}</div><div><strong>{customer.name}</strong><p>{customer.company}</p><small>{customer.email}</small></div><span className={`badge ${customer.status}`}>{customer.status}</span><div className="score"><strong>{customer.satisfaction}%</strong><small>Soddisfazione</small></div></button>)}</section> : <EmptyState title="Nessun cliente" text="Registra il primo cliente per creare e inviare un preventivo." />}</div>}
        {!loading && view === "products" && <div className="view-content reveal"><PageIntro title="Listino prezzi" text="Prodotti e servizi ufficiali usati nei preventivi e nelle automazioni." action={() => setProductDialogOpen(true)} actionLabel="Nuova voce" />{products.length ? <section className="panel"><div className="table-wrap"><table><thead><tr><th>Codice</th><th>Prodotto o servizio</th><th>Unità</th><th>Prezzo</th><th>IVA</th><th>Stato</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.sku}</strong></td><td><strong>{product.name}</strong><small>{product.description}</small></td><td>{product.unit}</td><td className="money">{currency(product.unitPrice)}</td><td>{product.taxRate}%</td><td><button className={`badge ${product.active ? "attivo" : "inattivo"}`} onClick={() => void toggleProduct(product)}>{product.active ? "Attivo" : "Disattivato"}</button></td></tr>)}</tbody></table></div></section> : <EmptyState title="Listino vuoto" text="Inserisci prodotti e servizi per creare preventivi con prezzi controllati." />}</div>}
        {!loading && view === "quotes" && <div className="view-content reveal"><PageIntro title="Preventivi e offerte" text="PDF, revisioni, approvazioni e conversione automatica in ordine." action={() => customers.length ? setQuoteDialogOpen(true) : setCustomerDialogOpen(true)} actionLabel={customers.length ? "Nuovo preventivo" : "Prima crea un cliente"} />{quotes.length ? <section className="panel"><QuoteTable quotes={quotes} onDownload={downloadQuote} onSend={sendQuote} onRevise={(quote) => void quoteWorkflow(quote, "revise")} onApprove={(quote) => void quoteWorkflow(quote, "approve")} busyId={quoteAction} /></section> : <EmptyState title="Nessun preventivo" text="Crea il primo preventivo: il PDF verrà generato e salvato automaticamente." />}</div>}
        {!loading && view === "team" && <div className="view-content reveal"><PageIntro title="Personale e presenze" text="Anagrafiche, ore settimanali e report persistenti." action={() => setEmployeeDialogOpen(true)} actionLabel="Nuovo dipendente" /><div className="module-toolbar"><button className="secondary-button" onClick={() => void generateHrReport()}><Download size={16} />Genera report settimanale</button></div>{employees.length ? <section className="team-grid">{employees.map((employee) => <article className="team-member" key={employee.id}><div className="member-top"><div className="avatar large">{employee.name.split(" ").map((part) => part[0]).join("")}</div><span className={`presence ${employee.status}`}>{employee.status}</span></div><h3>{employee.name}</h3><p>{employee.role}</p><small>{employee.department}</small><div className="hours"><Clock3 size={17} /><strong>{employee.weeklyHours} h</strong><button onClick={() => setAttendanceEmployee(employee)}>Registra ore</button></div></article>)}</section> : <EmptyState title="Nessun dipendente" text="Aggiungi il team per gestire presenze e report settimanali." />}</div>}
        {!loading && view === "email" && <div className="view-content reveal"><PageIntro title="Posta aziendale" text="Caselle, messaggi ricevuti e inviati salvati nel database aziendale." action={() => setMailboxDialogOpen(true)} actionLabel="Aggiungi casella" /><div className="mail-layout"><aside className="panel mailbox-list"><div className="section-heading"><div><p className="eyebrow">Caselle</p><h2>{mailboxes.length} configurate</h2></div><Settings size={18} /></div>{mailboxes.map((mailbox) => <div className="mailbox-row" key={mailbox.id}><div><strong>{mailbox.displayName ?? mailbox.email}</strong><small>{mailbox.email}</small></div><label><input type="checkbox" checked={mailbox.autoReply} onChange={(event) => void updateMailbox(mailbox, { autoReply: event.target.checked })} /> Risposta automatica</label>{mailbox.isPrimary ? <span className="badge attivo">Principale</span> : <button onClick={() => void updateMailbox(mailbox, { isPrimary: true })}>Imposta principale</button>}</div>)}</aside><section className="panel mail-panel"><div className="mail-tabs"><button className={emailFolder === "INBOUND" ? "active" : ""} onClick={() => setEmailFolder("INBOUND")}><Inbox size={16} />Ricevute</button><button className={emailFolder === "OUTBOUND" ? "active" : ""} onClick={() => setEmailFolder("OUTBOUND")}><Send size={16} />Inviate</button></div><div className="message-list">{emails.filter((email) => email.direction === emailFolder).map((email) => <article className="message-row" key={email.id}><div className="message-meta"><strong>{emailFolder === "INBOUND" ? email.from : email.to}</strong><time>{new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(email.sentAt ?? email.receivedAt))}</time></div><h3>{email.subject}</h3><p>{email.text}</p><div><span className="badge lead">{email.category}</span>{emailFolder === "INBOUND" && <button onClick={() => setReplyEmail(email)}><Send size={14} />Rispondi</button>}</div></article>)}{!emails.some((email) => email.direction === emailFolder) && <EmptyState title="Nessun messaggio" text={emailFolder === "INBOUND" ? "Le nuove email di lavoro compariranno qui." : "Le risposte inviate compariranno qui."} />}</div></section></div></div>}
        {!loading && view === "ai" && <div className="view-content reveal"><PageIntro title="AI orchestrator" text="Configura regole persistenti e verifica le decisioni operative." /><StatusStrip status={systemStatus} /><section className="automation-grid">{automationRules.map((rule) => <article key={rule.id}><div><strong>{rule.name}</strong><small>{rule.trigger}</small></div><div className="action-list">{rule.actions.map((action) => <span key={action}>{action}</span>)}</div><label className="switch"><input type="checkbox" checked={rule.enabled} onChange={() => void toggleAutomation(rule)} /><span /></label></article>)}</section><div className="test-grid"><section className="panel test-console"><div className="section-heading"><div><p className="eyebrow">Analisi operativa</p><h2>Analizza una richiesta</h2></div><Sparkles size={19} /></div><form onSubmit={testAi}><label>Oggetto<input name="subject" required defaultValue="Reclamo urgente" /></label><label>Contenuto<textarea name="text" required defaultValue="Il servizio è bloccato e richiedo assistenza immediata." /></label><button className="primary-button" disabled={testing === "ai"} type="submit"><Sparkles size={17} />{testing === "ai" ? "Analisi..." : "Analizza contenuto"}</button></form></section><TestResult title="Decisione orchestratore" result={aiResult} empty="Analizza un contenuto per visualizzare la decisione." /></div></div>}
      </section>

      {dialogOpen && <div className="modal-backdrop" onMouseDown={() => setDialogOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="task-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Azione rapida</p><h2 id="task-title">Nuova attività</h2></div><button className="icon-button" onClick={() => setDialogOpen(false)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={createTask}><label>Titolo<input name="title" required placeholder="Es. Richiamare il cliente" /></label><label>Responsabile<select name="owner"><option>Commerciale</option><option>Amministrazione</option><option>Customer care</option><option>HR</option></select></label><label>Priorità<select name="priority"><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option><option value="bassa">Bassa</option></select></label><button className="primary-button submit-button" type="submit"><Send size={17} />Crea attività</button></form></div></div>}
      {customerDialogOpen && <div className="modal-backdrop" onMouseDown={() => setCustomerDialogOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="customer-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">CRM</p><h2 id="customer-title">Nuovo cliente</h2></div><button className="icon-button" onClick={() => setCustomerDialogOpen(false)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={createCustomer}><label>Referente<input name="name" required placeholder="Nome e cognome" /></label><label>Azienda<input name="company" required placeholder="Ragione sociale" /></label><label>Email<input name="email" type="email" required placeholder="cliente@azienda.it" /></label><label>Telefono<input name="phone" placeholder="+39 ..." /></label><button className="primary-button submit-button" type="submit"><Plus size={17} />Salva cliente</button></form></div></div>}
      {quoteDialogOpen && <div className="modal-backdrop" onMouseDown={() => setQuoteDialogOpen(false)}><div className="modal quote-modal" role="dialog" aria-modal="true" aria-labelledby="quote-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Commerciale</p><h2 id="quote-title">Nuovo preventivo</h2></div><button className="icon-button" onClick={() => setQuoteDialogOpen(false)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={createQuote}><label>Cliente<select name="customerId" required>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company} · {customer.name}</option>)}</select></label><label>Titolo<input name="title" required placeholder="Es. Automazione customer care" /></label><label>Voce di listino<select name="productId"><option value="">Voce personalizzata</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name} · {currency(product.unitPrice)}</option>)}</select></label><label>Descrizione personalizzata<textarea name="description" placeholder="Obbligatoria solo senza voce di listino" /></label><div className="form-row"><label>Quantità<input name="quantity" type="number" min="0.01" step="0.01" required defaultValue="1" /></label><label>Prezzo personalizzato<input name="unitPrice" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Sconto riga %<input name="itemDiscountPercent" type="number" min="0" max="100" step="0.1" defaultValue="0" /></label></div><div className="form-row"><label>IVA %<input name="taxRate" type="number" min="0" step="0.1" defaultValue="22" /></label><label>Sconto totale %<input name="discountPercent" type="number" min="0" max="100" step="0.1" defaultValue="0" /></label><label>Follow-up<input name="followUpAt" type="date" /></label></div><label>Valido fino al<input name="validUntil" type="date" /></label><label>Note<textarea name="notes" placeholder="Condizioni di pagamento, tempi di consegna..." /></label><button className="primary-button submit-button" disabled={quoteAction === "create"} type="submit"><CircleDollarSign size={17} />{quoteAction === "create" ? "Generazione PDF..." : "Crea e salva PDF"}</button></form></div></div>}
      {accountDialogOpen && account && <div className="modal-backdrop" onMouseDown={() => setAccountDialogOpen(false)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div className="company-modal-title"><CompanyMark company={account.company} /><div><p className="eyebrow">Brand aziendale</p><h2>{account.company.name}</h2></div></div><button className="icon-button" onClick={() => setAccountDialogOpen(false)} aria-label="Chiudi"><X size={19} /></button></div><form className="branding-form" onSubmit={updateBranding}><label>Nome azienda<input name="name" required defaultValue={account.company.name} /></label><label>Logo aziendale<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPG o WebP. Verrà ottimizzato automaticamente.</small></label><button className="primary-button" disabled={brandingPending}>{brandingPending ? "Aggiornamento..." : "Aggiorna brand"}</button></form><div className="account-info"><p><strong>Utente</strong><span>{account.user.name} · {account.user.email}</span></p><p><strong>Ruolo</strong><span>{account.user.role}</span></p><p><strong>Email principale</strong><span>{account.company.email}</span></p><p><strong>Partita IVA</strong><span>{account.company.vatNumber ?? "Non indicata"}</span></p><p><strong>Sede</strong><span>{[account.company.address, account.company.postalCode, account.company.city].filter(Boolean).join(", ") || "Non indicata"}</span></p><button className="logout-button" onClick={() => void logout()}><LogOut size={16} />Esci da AI Office</button></div></div></div>}
      {mailboxDialogOpen && <div className="modal-backdrop" onMouseDown={() => setMailboxDialogOpen(false)}><div className="modal quote-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Posta aziendale</p><h2>Collega una casella</h2></div><button className="icon-button" onClick={() => setMailboxDialogOpen(false)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={createMailbox}><label>Nome visualizzato<input name="displayName" placeholder="Es. Ufficio commerciale" /></label><label>Indirizzo email<input name="email" type="email" required /></label><label>Nome utente<input name="username" placeholder="Di solito coincide con l'email" /></label><label>Password o password per app<input name="password" type="password" required autoComplete="new-password" /><small>Per Gmail usa la password per app di 16 caratteri; puoi incollarla con o senza spazi.</small></label><div className="form-row two-fields"><label>Server IMAP<input name="imapHost" required placeholder="imap.example.com" /></label><label>Porta IMAP<input name="imapPort" type="number" defaultValue="993" required /></label></div><div className="form-row two-fields"><label>Server SMTP<input name="smtpHost" required placeholder="smtp.example.com" /></label><label>Porta SMTP<input name="smtpPort" type="number" defaultValue="465" required /></label></div><label className="check-label"><input name="isPrimary" type="checkbox" defaultChecked /> Usa come casella principale</label><label className="check-label"><input name="autoReply" type="checkbox" /> Abilita risposta automatica</label><button className="primary-button submit-button"><Mail size={16} />Verifica e collega</button></form></div></div>}
      {replyEmail && <div className="modal-backdrop" onMouseDown={() => setReplyEmail(null)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Risposta a {replyEmail.from}</p><h2>{replyEmail.subject}</h2></div><button className="icon-button" onClick={() => setReplyEmail(null)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={sendReply}><label>Oggetto<input name="subject" defaultValue={replyEmail.subject.toLowerCase().startsWith("re:") ? replyEmail.subject : `Re: ${replyEmail.subject}`} required /></label><label>Messaggio<textarea name="text" required autoFocus /></label><button className="primary-button submit-button"><Send size={16} />Invia risposta</button></form></div></div>}
      {productDialogOpen && <div className="modal-backdrop" onMouseDown={() => setProductDialogOpen(false)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Listino</p><h2>Nuovo prodotto o servizio</h2></div><button className="icon-button" onClick={() => setProductDialogOpen(false)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={createProduct}><div className="form-row two-fields"><label>Codice<input name="sku" required placeholder="SERV-001" /></label><label>Unità<input name="unit" defaultValue="cad." required /></label></div><label>Nome<input name="name" required /></label><label>Descrizione<textarea name="description" /></label><div className="form-row two-fields"><label>Prezzo unitario<input name="unitPrice" type="number" min="0" step="0.01" required /></label><label>IVA %<input name="taxRate" type="number" min="0" step="0.1" defaultValue="22" required /></label></div><button className="primary-button submit-button"><Plus size={16} />Aggiungi al listino</button></form></div></div>}
      {employeeDialogOpen && <div className="modal-backdrop" onMouseDown={() => setEmployeeDialogOpen(false)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">HR</p><h2>Nuovo dipendente</h2></div><button className="icon-button" onClick={() => setEmployeeDialogOpen(false)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={createEmployee}><label>Nome<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Ruolo<input name="role" required /></label><label>Reparto<input name="department" required /></label><button className="primary-button submit-button"><Plus size={16} />Aggiungi dipendente</button></form></div></div>}
      {attendanceEmployee && <div className="modal-backdrop" onMouseDown={() => setAttendanceEmployee(null)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Presenze</p><h2>{attendanceEmployee.name}</h2></div><button className="icon-button" onClick={() => setAttendanceEmployee(null)} aria-label="Chiudi"><X size={19} /></button></div><form onSubmit={recordAttendance}><label>Data<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Ore<input name="hours" type="number" min="0" max="24" step="0.25" required /></label><label>Nota<input name="note" /></label><button className="primary-button submit-button"><Clock3 size={16} />Registra presenza</button></form></div></div>}
      {customerDetail && <div className="modal-backdrop" onMouseDown={() => setCustomerDetail(null)}><div className="modal crm-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">CRM 360</p><h2>{customerDetail.company}</h2></div><button className="icon-button" onClick={() => setCustomerDetail(null)} aria-label="Chiudi"><X size={19} /></button></div><div className="crm-detail"><form onSubmit={saveCustomerDetail}><label>Note<textarea name="notes" defaultValue={customerDetail.notes ?? ""} /></label><label>Tag<input name="tags" defaultValue={customerDetail.tags.join(", ")} placeholder="vip, rinnovo, priorità" /></label><label>Canale preferito<select name="communication" defaultValue={String(customerDetail.preferences.communication ?? "email")}><option value="email">Email</option><option value="telefono">Telefono</option><option value="whatsapp">WhatsApp</option></select></label><button className="primary-button">Salva profilo</button></form><section><p className="eyebrow">Timeline</p><form className="ticket-form" onSubmit={createTicket}><input name="title" required placeholder="Nuovo ticket" /><select name="priority" defaultValue="MEDIUM"><option value="LOW">Bassa</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select><input name="description" placeholder="Descrizione" /><button className="secondary-button"><Plus size={15} />Apri ticket</button></form><div className="crm-timeline">{customerDetail.timeline.map((item) => <article key={`${item.type}-${item.id}`}><span>{item.type}</span><div><strong>{item.title}</strong><small>{item.detail} · {new Intl.DateTimeFormat("it-IT").format(new Date(item.at))}</small></div></article>)}{!customerDetail.timeline.length && <p>Nessuna interazione registrata.</p>}</div></section></div></div></div>}
    </main>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "register" && data.companyLogo instanceof File && data.companyLogo.size) data.companyLogo = await prepareLogo(data.companyLogo);
      else delete data.companyLogo;
      const response = await fetch(`${API_URL}/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Operazione fallita");
      onAuthenticated(result.token);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Operazione fallita"); }
    finally { setPending(false); }
  }

  return <main className="auth-shell"><section className="auth-brand"><div className="auth-brand-top"><span className="brand-mark">AO</span><span>AI Office Manager</span><i><span /> Operativo 24/7</i></div><div className="auth-hero"><p className="eyebrow">L'ufficio che lavora con te</p><h1>Più lavoro concluso.<br /><em>Meno lavoro manuale.</em></h1><p>Un unico spazio per email, clienti, preventivi e team. L'AI trasforma le richieste in azioni, mentre tu mantieni il controllo.</p><div className="auth-proof-row"><span><CheckCircle2 size={15} /> Setup guidato</span><span><LockKeyhole size={15} /> Dati isolati</span><span><Zap size={15} /> Automazioni live</span></div></div><div className="product-preview"><div className="preview-bar"><span className="preview-logo">AO</span><i /><i /><i /><small>Centro operativo</small><b>Live</b></div><div className="preview-body"><aside><span /><span className="active" /><span /><span /><span /></aside><div><div className="preview-title"><span><small>Buongiorno</small><strong>La tua azienda, a colpo d'occhio.</strong></span><button>+ Nuova attività</button></div><div className="preview-metrics"><article><small>Task aperti</small><b>12</b><i>−18% questa settimana</i></article><article><small>Pipeline</small><b>€ 48.6k</b><i>8 offerte attive</i></article><article><small>Email gestite</small><b>94%</b><i>in automatico</i></article></div><div className="preview-chart"><span><small>Flusso operativo</small><strong>Attività completate</strong></span><BarChart3 size={110} /></div></div></div></div></section><section className="auth-panel"><div className="auth-card"><div className="auth-tabs" role="tablist"><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }} type="button">Crea account</button><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }} type="button">Accedi</button></div><div className="auth-heading"><span className="auth-icon">{mode === "register" ? <Sparkles size={20} /> : <LockKeyhole size={20} />}</span><div><p className="eyebrow">{mode === "register" ? "Inizia ora" : "Bentornato"}</p><h2>{mode === "register" ? "Crea il tuo ufficio AI" : "Accedi al workspace"}</h2></div></div><p className="auth-copy">{mode === "register" ? "14 giorni di prova. Configurazione guidata inclusa." : "Continua da dove avevi lasciato."}</p>{error && <div className="auth-error">{error}</div>}<form onSubmit={submit}>{mode === "register" && <><div className="form-row"><label>Nome e cognome<input name="name" required autoComplete="name" placeholder="Mario Rossi" /></label><label>Nome azienda<input name="companyName" required placeholder="Rossi & Partners" /></label></div><label>Email aziendale<input name="companyEmail" type="email" required placeholder="info@azienda.it" /><small>La useremo per identificare il workspace.</small></label><label className="logo-upload">Logo aziendale <i>opzionale</i><input name="companyLogo" type="file" accept="image/png,image/jpeg,image/webp" /><small>Comparirà nell'app al posto del marchio AO.</small></label><div className="form-row"><label>Partita IVA <i>opzionale</i><input name="vatNumber" placeholder="IT01234567890" /></label><label>Città <i>opzionale</i><input name="city" placeholder="Milano" /></label></div></>}<label>Email di accesso<input name="email" type="email" required autoComplete="email" placeholder="nome@azienda.it" /></label><label>Password<input name="password" type="password" minLength={8} required autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="Minimo 8 caratteri" /></label><button className="auth-submit" disabled={pending} type="submit"><span>{pending ? "Configurazione..." : mode === "register" ? "Crea workspace" : "Entra nel workspace"}</span><ArrowRight size={18} /></button></form><p className="auth-legal">Continuando accetti i termini di servizio e l'informativa privacy.</p><div className="auth-security"><LockKeyhole size={14} /><span>Connessione protetta e dati separati per azienda</span></div></div></section></main>;
}

function PageIntro({ title, text, action, actionLabel }: { title: string; text: string; action?: () => void; actionLabel?: string }) {
  return <div className="page-intro"><div><h2>{title}</h2><p>{text}</p></div>{action && <button className="primary-button" onClick={action}><Plus size={17} />{actionLabel}</button>}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <section className="empty-state"><Building2 size={28} /><h3>{title}</h3><p>{text}</p></section>;
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Attività</th><th>Responsabile</th><th>Priorità</th><th>Stato</th><th>Scadenza</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><strong>{task.title}</strong></td><td>{task.owner}</td><td><span className={`priority ${task.priority}`}>{task.priority}</span></td><td><span className="status-label">{task.status}</span></td><td>{new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(task.dueAt))}</td></tr>)}</tbody></table></div>;
}

function QuoteTable({ quotes, onDownload, onSend, onRevise, onApprove, busyId }: { quotes: Quote[]; onDownload?: (quote: Quote) => void; onSend?: (quote: Quote) => void; onRevise?: (quote: Quote) => void; onApprove?: (quote: Quote) => void; busyId?: string | null }) {
  return <div className="table-wrap"><table><thead><tr><th>Numero / progetto</th><th>Cliente</th><th>Valore</th><th>Stato</th><th>Creazione</th>{onDownload && <th>Azioni</th>}</tr></thead><tbody>{quotes.map((quote) => <tr key={quote.id}><td><small>{quote.number}</small><strong>{quote.title}</strong></td><td>{quote.customer}</td><td className="money">{currency(quote.amount)}</td><td><span className={`badge ${quote.status}`}>{quote.status}</span></td><td>{new Intl.DateTimeFormat("it-IT").format(new Date(quote.createdAt))}</td>{onDownload && <td><div className="row-actions"><button title="Apri PDF" aria-label={`Apri PDF ${quote.number}`} onClick={() => onDownload(quote)} disabled={busyId === quote.id}><Download size={16} /></button><button title="Invia al cliente" aria-label={`Invia ${quote.number}`} onClick={() => onSend?.(quote)} disabled={busyId === quote.id || quote.status === "inviato"}><Send size={16} /></button>{onRevise && <button title="Crea revisione" aria-label={`Revisiona ${quote.number}`} onClick={() => onRevise(quote)} disabled={busyId === quote.id}><RefreshCw size={16} /></button>}{onApprove && <button title="Approva e crea ordine" aria-label={`Approva ${quote.number}`} onClick={() => onApprove(quote)} disabled={busyId === quote.id || quote.status === "approvato"}><CheckCircle2 size={16} /></button>}</div></td>}</tr>)}</tbody></table></div>;
}

function StatusStrip({ status }: { status: SystemStatus | null }) {
  const items = [
    ["API", status?.api.status ?? "verifica"], ["Email", status?.email.status ?? "verifica"],
    ["AI", status?.ai.mode ?? "verifica"], ["Dati", status?.database.mode ?? "verifica"]
  ];
  return <section className="status-strip" aria-label="Stato servizi">{items.map(([label, value]) => <div key={label}><span className={value === "non-configurato" ? "service-light warning" : "service-light"} /><p>{label}</p><strong>{value}</strong></div>)}</section>;
}

function TestResult({ title, result, empty, extra }: { title: string; result: Decision | null; empty: string; extra?: React.ReactNode }) {
  return <section className="panel test-result"><div className="section-heading"><div><p className="eyebrow">Output verificabile</p><h2>{title}</h2></div><Activity size={19} /></div>{result ? <div className="result-content"><div className="decision-grid"><div><small>Categoria</small><strong>{result.category}</strong></div><div><small>Priorità</small><strong>{result.priority}</strong></div><div><small>Reparto</small><strong>{result.department}</strong></div></div><div className="result-block"><small>Azioni decise</small><div className="action-list">{result.actions.map((action) => <span key={action}>{action}</span>)}</div></div>{extra}</div> : <div className="empty-result"><Sparkles size={26} /><p>{empty}</p></div>}</section>;
}