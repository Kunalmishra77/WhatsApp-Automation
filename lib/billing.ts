import crypto from 'node:crypto';

export const GST_RATE = 18;

export const PLAN_KEYS = { WHATSAPP: 'whatsapp', WHATSAPP_INSTAGRAM: 'whatsapp_instagram' } as const;
export type PlanKey = typeof PLAN_KEYS[keyof typeof PLAN_KEYS];

export type SubStatus = 'pending' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export function planKeyFor(hasInstagram: boolean): PlanKey {
  return hasInstagram ? PLAN_KEYS.WHATSAPP_INSTAGRAM : PLAN_KEYS.WHATSAPP;
}

export function computeAmounts(basePaise: number): { basePaise: number; gstPaise: number; totalPaise: number } {
  const gstPaise = Math.round((basePaise * GST_RATE) / 100);
  return { basePaise, gstPaise, totalPaise: basePaise + gstPaise };
}

export function addOneMonth(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1; // 1-based current month
  const d = parts[2] ?? 1;
  // m (1-based current month) used directly as a 0-based Date.UTC month index
  // lands on the *next* month (e.g. Aug=8 as index -> September), so no +1 needed here.
  const firstNext = new Date(Date.UTC(y, m, 1));
  const lastDayNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  firstNext.setUTCDate(Math.min(d, lastDayNext));
  return firstNext.toISOString().slice(0, 10);
}

export function formatInvoiceNo(seq: number, year: number): string {
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
}

export function rupees(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface NextBillingActionInput {
  status: SubStatus;
  currentPeriodEnd: string;
  graceUntil: string | null;
  today: string;
  graceDays: number;
  reminderDaysBefore: number;
  reminderSentFor: string | null;
}

export interface NextBillingActionResult {
  action: 'none' | 'send_reminder' | 'enter_grace' | 'suspend';
  status: SubStatus;
  isActive: boolean;
  graceUntil: string | null;
  reminderSentFor: string | null;
}

export function nextBillingAction(i: NextBillingActionInput): NextBillingActionResult {
  const { status, currentPeriodEnd, graceUntil, today } = i;

  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

  if (status === 'suspended' || status === 'cancelled') {
    return { action: 'none', status, isActive: false, graceUntil, reminderSentFor: i.reminderSentFor };
  }

  if (status === 'active' && today >= currentPeriodEnd) {
    const g = addDaysStr(currentPeriodEnd, i.graceDays);
    return { action: 'enter_grace', status: 'past_due', isActive: true, graceUntil: g, reminderSentFor: i.reminderSentFor };
  }

  if (status === 'past_due' && graceUntil && today >= graceUntil) {
    return { action: 'suspend', status: 'suspended', isActive: false, graceUntil, reminderSentFor: i.reminderSentFor };
  }

  // reminder window: still active, within reminderDaysBefore of end, not yet sent this cycle
  if (
    status === 'active' &&
    daysBetween(today, currentPeriodEnd) <= i.reminderDaysBefore &&
    daysBetween(today, currentPeriodEnd) >= 0 &&
    i.reminderSentFor !== currentPeriodEnd
  ) {
    return { action: 'send_reminder', status, isActive: true, graceUntil, reminderSentFor: currentPeriodEnd };
  }

  // Only 'pending' | 'active' | 'past_due' can reach here (suspended/cancelled returned above).
  return {
    action: 'none',
    status,
    isActive: true,
    graceUntil,
    reminderSentFor: i.reminderSentFor,
  };
}

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEq(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEq(expected, signature);
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
