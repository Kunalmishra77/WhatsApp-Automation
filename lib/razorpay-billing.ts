// Razorpay Subscriptions billing — India-first alternative to Stripe
// Uses plain fetch (no SDK needed)

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

function getAuthHeader(): string {
  const keyId     = process.env.RAZORPAY_KEY_ID ?? '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export const RAZORPAY_PLANS = {
  free: {
    name:    'Free',
    price:   0,
    planId:  null as string | null,
    limits:  { agents: 3, messages_per_month: 1000, campaigns_per_month: 5, kb_entries: 50 },
  },
  pro: {
    name:    'Pro',
    price:   2999,
    planId:  process.env.RAZORPAY_PRO_PLAN_ID ?? null,
    limits:  { agents: 10, messages_per_month: 25000, campaigns_per_month: 50, kb_entries: 500 },
  },
  enterprise: {
    name:    'Enterprise',
    price:   9999,
    planId:  process.env.RAZORPAY_ENTERPRISE_PLAN_ID ?? null,
    limits:  { agents: -1, messages_per_month: -1, campaigns_per_month: -1, kb_entries: -1 },
  },
} as const;

export type RazorpayPlanKey = keyof typeof RAZORPAY_PLANS;

// Create a Razorpay Subscription
export async function createSubscription(planId: string, workspaceId: string): Promise<{
  id: string;
  short_url: string;  // hosted checkout URL
} | null> {
  try {
    const res = await fetch(`${RAZORPAY_BASE}/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id:         planId,
        quantity:        1,
        total_count:     120, // 10 years max
        notes:           { workspaceId },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Razorpay] Create subscription error:', err);
      return null;
    }
    return await res.json() as { id: string; short_url: string };
  } catch {
    return null;
  }
}

// Cancel a Razorpay Subscription
export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${RAZORPAY_BASE}/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel_at_cycle_end: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Verify Razorpay webhook signature
export function verifyRazorpayWebhook(body: string, signature: string): boolean {
  const crypto = require('crypto') as typeof import('crypto');
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}
