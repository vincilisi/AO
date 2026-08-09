import { createHash } from "node:crypto";
import type { SaaSPlan } from "@ai-office/billing";

interface PayPalLink {
  href: string;
  rel: string;
}

interface PayPalPlan {
  id: string;
}

export interface PayPalSubscription {
  id: string;
  plan_id: string;
  status: string;
  custom_id?: string;
  start_time?: string;
  subscriber?: { payer_id?: string; email_address?: string };
  billing_info?: { next_billing_time?: string; failed_payments_count?: number };
  links?: PayPalLink[];
}

export interface PayPalWebhookEvent {
  event_type: string;
  resource: Record<string, unknown> & {
    id?: string;
    custom_id?: string;
    billing_agreement_id?: string;
    status?: string;
  };
}

function configurationError() {
  return Object.assign(new Error("PayPal non configurato: impostare PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET e PAYPAL_WEBHOOK_ID"), { statusCode: 503 });
}

function apiBase() {
  return process.env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID);
}

async function accessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw configurationError();
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const result = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) throw Object.assign(new Error(result.error_description ?? "Autenticazione PayPal fallita"), { statusCode: 502 });
  return result.access_token;
}

async function paypalRequest<T>(path: string, init: RequestInit = {}, requestId?: string) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      ...init.headers
    }
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) as T : {} as T;
  if (!response.ok) {
    const error = result as { message?: string; details?: Array<{ description?: string }> };
    const detail = error.details?.[0]?.description;
    throw Object.assign(new Error(detail ?? error.message ?? `Errore PayPal ${response.status}`), { statusCode: 502 });
  }
  return result;
}

function requestId(companyId: string, planCode: string, operation: string) {
  return createHash("sha256").update(`${companyId}:${planCode}:${operation}`).digest("hex").slice(0, 36);
}

function euro(cents: number) {
  return (cents / 100).toFixed(2);
}

export function paypalApprovalUrl(subscription: PayPalSubscription) {
  return subscription.links?.find((link) => link.rel === "approve")?.href ?? null;
}

async function createPlan(companyId: string, plan: SaaSPlan) {
  const product = await paypalRequest<{ id: string }>("/v1/catalogs/products", {
    method: "POST",
    body: JSON.stringify({
      name: `AI Office ${plan.name}`,
      description: plan.description.slice(0, 256),
      type: "SERVICE",
      category: "SOFTWARE"
    })
  }, requestId(companyId, plan.code, "product"));

  return paypalRequest<PayPalPlan>("/v1/billing/plans", {
    method: "POST",
    body: JSON.stringify({
      product_id: product.id,
      name: `AI Office ${plan.name}`,
      description: plan.audience,
      billing_cycles: [
        {
          frequency: { interval_unit: "DAY", interval_count: 14 },
          tenure_type: "TRIAL",
          sequence: 1,
          total_cycles: 1
        },
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 2,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: euro(plan.monthlyPriceCents), currency_code: "EUR" } }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: euro(plan.setupPriceCents), currency_code: "EUR" },
        setup_fee_failure_action: "CANCEL",
        payment_failure_threshold: 3
      }
    })
  }, requestId(companyId, plan.code, "plan"));
}

export async function createPayPalSubscription(input: {
  companyId: string;
  companyEmail: string;
  plan: SaaSPlan;
  paypalPlanId: string | null;
}) {
  const planId = input.paypalPlanId ?? (await createPlan(input.companyId, input.plan)).id;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const subscription = await paypalRequest<PayPalSubscription>("/v1/billing/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      custom_id: input.companyId,
      subscriber: { email_address: input.companyEmail },
      application_context: {
        brand_name: "AI Office Manager",
        locale: "it-IT",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${appUrl}/?checkout=success`,
        cancel_url: `${appUrl}/?checkout=cancelled`
      }
    })
  });
  const approvalUrl = paypalApprovalUrl(subscription);
  if (!approvalUrl) throw Object.assign(new Error("PayPal non ha restituito il link di approvazione"), { statusCode: 502 });
  return { subscriptionId: subscription.id, planId, approvalUrl };
}

export function getPayPalSubscription(subscriptionId: string) {
  return paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function cancelPayPalSubscription(subscriptionId: string) {
  await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: "Cancellazione richiesta dal cliente" })
  });
}

export async function verifyPayPalWebhook(headers: Record<string, string | string[] | undefined>, event: PayPalWebhookEvent) {
  if (!process.env.PAYPAL_WEBHOOK_ID) throw configurationError();
  const header = (name: string) => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const required = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"] as const;
  if (required.some((name) => !header(name))) throw Object.assign(new Error("Firma PayPal mancante"), { statusCode: 400 });
  const result = await paypalRequest<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: header("paypal-auth-algo"),
      cert_url: header("paypal-cert-url"),
      transmission_id: header("paypal-transmission-id"),
      transmission_sig: header("paypal-transmission-sig"),
      transmission_time: header("paypal-transmission-time"),
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: event
    })
  });
  return result.verification_status === "SUCCESS";
}
