// Razorpay REST client — plain fetch, no SDK.
// Consolidated hardened client for Task 3 of the Razorpay billing plan.
// The legacy `lib/razorpay-billing.ts` skeleton is left untouched (its old
// checkout/webhook importers are rewritten in Tasks 4-5 to use this file).

import { getRequiredSecret } from '@/lib/supabase-env';

export { verifyPaymentSignature, verifyWebhookSignature } from '@/lib/billing';

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 20_000;

function getAuthHeader(): string {
  const keyId = getRequiredSecret('RAZORPAY_KEY_ID');
  const keySecret = getRequiredSecret('RAZORPAY_KEY_SECRET');
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

/** Returns the public Razorpay key ID (safe to send to the client). */
export function getKeyId(): string {
  return getRequiredSecret('RAZORPAY_KEY_ID');
}

/**
 * Low-level Razorpay REST call. Basic-auth signed, 20s timeout, throws with
 * the Razorpay-provided error message on any non-2xx response.
 */
export async function razorpayFetch(path: string, method: string, body?: object): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${RAZORPAY_BASE}${path}`, {
      method,
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    if (!res.ok) {
      const message =
        json?.error?.description ??
        json?.error?.reason ??
        (text || `Razorpay request failed with status ${res.status}`);
      throw new Error(`Razorpay API error (${res.status}): ${message}`);
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createOrder(a: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string }> {
  return razorpayFetch('/orders', 'POST', {
    amount: a.amountPaise,
    currency: 'INR',
    receipt: a.receipt,
    notes: a.notes,
  });
}

export async function createPlan(a: {
  period: string;
  interval: number;
  name: string;
  amountPaise: number;
}): Promise<{ id: string }> {
  return razorpayFetch('/plans', 'POST', {
    period: a.period,
    interval: a.interval,
    item: {
      name: a.name,
      amount: a.amountPaise,
      currency: 'INR',
    },
  });
}

export async function createSubscription(a: {
  planId: string;
  totalCount: number;
  notes?: Record<string, string>;
  customerNotify?: boolean;
}): Promise<{ id: string; short_url?: string }> {
  return razorpayFetch('/subscriptions', 'POST', {
    plan_id: a.planId,
    total_count: a.totalCount,
    customer_notify: a.customerNotify === false ? 0 : 1,
    notes: a.notes,
  });
}

export async function fetchSubscription(id: string): Promise<any> {
  return razorpayFetch(`/subscriptions/${id}`, 'GET');
}

export async function updateSubscriptionPlan(id: string, planId: string): Promise<any> {
  return razorpayFetch(`/subscriptions/${id}`, 'PATCH', {
    plan_id: planId,
    schedule_change_at: 'cycle_end',
  });
}

export async function cancelSubscription(id: string, atCycleEnd: boolean): Promise<any> {
  return razorpayFetch(`/subscriptions/${id}/cancel`, 'POST', {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}
