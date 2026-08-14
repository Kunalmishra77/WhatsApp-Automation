import crypto from 'node:crypto';
import { zonedDayStartUtc } from '@/lib/date-range';

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

export type Term = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export const TERMS: Record<Term, { months: number; label: string }> = {
  monthly: { months: 1, label: 'Monthly' },
  quarterly: { months: 3, label: 'Quarterly' },
  half_yearly: { months: 6, label: '6 Months' },
  yearly: { months: 12, label: '1 Year' },
};

export function monthsForTerm(term: Term): number {
  return TERMS[term].months;
}

export function addMonths(dateStr: string, n: number): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1; // 1-based current month
  const d = parts[2] ?? 1;
  // Date.UTC(y, (m-1)+n, 1) normalizes month overflow/underflow (e.g. month index 13 -> next Jan)
  // handling arbitrary N-month jumps and year rollovers in one step.
  const first = new Date(Date.UTC(y, (m - 1) + n, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

export const addOneMonth = (dateStr: string): string => addMonths(dateStr, 1);

export function timeLeft(
  periodEnd: string,
  now: Date,
  tz = 'Asia/Kolkata'
): { expired: boolean; days: number; hours: number; label: string } {
  const expiryMs = Date.parse(zonedDayStartUtc(periodEnd, tz)); // IST midnight of the end date
  const remain = expiryMs - now.getTime();
  if (remain <= 0) return { expired: true, days: 0, hours: 0, label: 'Expired' };
  const days = Math.floor(remain / 86_400_000);
  const hours = Math.floor(remain / 3_600_000);
  if (days >= 1) return { expired: false, days, hours, label: `${days} day${days > 1 ? 's' : ''} left` };
  return { expired: false, days: 0, hours, label: `${hours} hour${hours !== 1 ? 's' : ''} left` };
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

  if (status === 'suspended' || status === 'pending') {
    return { action: 'none', status, isActive: false, graceUntil, reminderSentFor: i.reminderSentFor };
  }

  // A cancelled subscription keeps access until its current period ends —
  // only then does the sweep suspend it (which flips workspaces.is_active=false).
  if (status === 'cancelled') {
    if (today >= currentPeriodEnd) {
      return { action: 'suspend', status: 'suspended', isActive: false, graceUntil, reminderSentFor: i.reminderSentFor };
    }
    return { action: 'none', status, isActive: true, graceUntil, reminderSentFor: i.reminderSentFor };
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

  // Only 'active' | 'past_due' can reach here (suspended/pending returned above;
  // cancelled returned above too, either as 'suspend' or as isActive:true 'none').
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
