// Stripe integration using plain fetch (no SDK needed for basic operations)

export const STRIPE_PLANS = {
  free: {
    name:           'Free',
    price:          0,
    priceId:        null,
    limits: {
      agents:                3,
      messages_per_month:    1000,
      campaigns_per_month:   5,
      kb_entries:            50,
    },
  },
  pro: {
    name:           'Pro',
    price:          2999,
    currency:       'INR',
    priceId:        process.env.STRIPE_PRO_PRICE_ID ?? null,
    limits: {
      agents:                10,
      messages_per_month:    25000,
      campaigns_per_month:   50,
      kb_entries:            500,
    },
  },
  enterprise: {
    name:           'Enterprise',
    price:          9999,
    currency:       'INR',
    priceId:        process.env.STRIPE_ENTERPRISE_PRICE_ID ?? null,
    limits: {
      agents:                -1,   // unlimited
      messages_per_month:    -1,
      campaigns_per_month:   -1,
      kb_entries:            -1,
    },
  },
} as const;

export type PlanKey = keyof typeof STRIPE_PLANS;

// Create a Stripe Checkout session
export async function createCheckoutSession(params: {
  customerId?: string;
  priceId: string;
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]':    params.priceId,
    'line_items[0][quantity]': '1',
    success_url: params.successUrl,
    cancel_url:  params.cancelUrl,
    'metadata[workspaceId]': params.workspaceId,
  });
  if (params.customerId) body.set('customer', params.customerId);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) return null;
  const data = await res.json() as { url?: string };
  return data.url ? { url: data.url } : null;
}

// Create Stripe Customer Portal session
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string } | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  const body = new URLSearchParams({
    customer:   params.customerId,
    return_url: params.returnUrl,
  });

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) return null;
  const data = await res.json() as { url?: string };
  return data.url ? { url: data.url } : null;
}
