import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { computeAmounts, planKeyFor, addOneMonth, formatInvoiceNo, rupees,
  nextBillingAction, verifyPaymentSignature, verifyWebhookSignature,
  addMonths, monthsForTerm, timeLeft, TERMS } from '@/lib/billing';

describe('GST math', () => {
  it('WhatsApp base 299900 → gst 53982, total 353882', () => {
    expect(computeAmounts(299900)).toEqual({ basePaise: 299900, gstPaise: 53982, totalPaise: 353882 });
  });
  it('bundle base 399800 → gst 71964, total 471764', () => {
    expect(computeAmounts(399800)).toEqual({ basePaise: 399800, gstPaise: 71964, totalPaise: 471764 });
  });
});
describe('plan selection', () => {
  it('maps instagram flag', () => {
    expect(planKeyFor(false)).toBe('whatsapp');
    expect(planKeyFor(true)).toBe('whatsapp_instagram');
  });
});
describe('dates + invoice + display', () => {
  it('addOneMonth normal + month-end clamp', () => {
    expect(addOneMonth('2026-08-01')).toBe('2026-09-01');
    expect(addOneMonth('2026-01-31')).toBe('2026-02-28');
  });
  it('addOneMonth year rollover + leap day', () => {
    expect(addOneMonth('2026-12-15')).toBe('2027-01-15');
    expect(addOneMonth('2026-12-31')).toBe('2027-01-31');
    expect(addOneMonth('2028-01-31')).toBe('2028-02-29');
  });
  it('invoice number format', () => {
    expect(formatInvoiceNo(123, 2026)).toBe('INV-2026-000123');
  });
  it('rupees', () => { expect(rupees(353882)).toBe('3,538.82'); });
});
describe('state machine (grace 3, reminder 3)', () => {
  const base = { graceDays: 3, reminderDaysBefore: 3 };
  it('sends reminder 3 days before end', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-08-29', reminderSentFor: null });
    expect(r.action).toBe('send_reminder'); expect(r.reminderSentFor).toBe('2026-09-01'); expect(r.isActive).toBe(true);
  });
  it('does not resend reminder for same cycle', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-08-30', reminderSentFor: '2026-09-01' });
    expect(r.action).toBe('none');
  });
  it('enters grace at period end', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-09-01', reminderSentFor: '2026-09-01' });
    expect(r.action).toBe('enter_grace'); expect(r.status).toBe('past_due'); expect(r.graceUntil).toBe('2026-09-04'); expect(r.isActive).toBe(true);
  });
  it('suspends after grace', () => {
    const r = nextBillingAction({ ...base, status: 'past_due', currentPeriodEnd: '2026-09-01', graceUntil: '2026-09-04', today: '2026-09-04', reminderSentFor: '2026-09-01' });
    expect(r.action).toBe('suspend'); expect(r.status).toBe('suspended'); expect(r.isActive).toBe(false);
  });
  it('active mid-cycle → none', () => {
    const r = nextBillingAction({ ...base, status: 'active', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-08-15', reminderSentFor: null });
    expect(r.action).toBe('none'); expect(r.isActive).toBe(true);
  });
  it('pending subscription is never active and takes no action', () => {
    const r = nextBillingAction({ ...base, status: 'pending', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-09-05', reminderSentFor: null });
    expect(r.action).toBe('none'); expect(r.isActive).toBe(false);
  });
  it('cancelled subscription keeps access before period end', () => {
    const r = nextBillingAction({ ...base, status: 'cancelled', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-08-15', reminderSentFor: null });
    expect(r.action).toBe('none'); expect(r.isActive).toBe(true);
  });
  it('cancelled subscription suspends at period end', () => {
    const r = nextBillingAction({ ...base, status: 'cancelled', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-09-01', reminderSentFor: null });
    expect(r.action).toBe('suspend'); expect(r.status).toBe('suspended'); expect(r.isActive).toBe(false);
  });
  it('cancelled subscription stays suspended after period end', () => {
    const r = nextBillingAction({ ...base, status: 'cancelled', currentPeriodEnd: '2026-09-01', graceUntil: null, today: '2026-09-05', reminderSentFor: null });
    expect(r.action).toBe('suspend'); expect(r.status).toBe('suspended'); expect(r.isActive).toBe(false);
  });
});
describe('addMonths', () => {
  it('adds N calendar months', () => {
    expect(addMonths('2026-08-01', 3)).toBe('2026-11-01');
    expect(addMonths('2026-08-01', 6)).toBe('2027-02-01');
    expect(addMonths('2026-08-01', 12)).toBe('2027-08-01');
  });
  it('clamps month-end + year rollover', () => {
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // leap
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});
describe('monthsForTerm', () => {
  it('maps terms', () => {
    expect(monthsForTerm('monthly')).toBe(1);
    expect(monthsForTerm('quarterly')).toBe(3);
    expect(monthsForTerm('half_yearly')).toBe(6);
    expect(monthsForTerm('yearly')).toBe(12);
  });
});
describe('timeLeft (IST)', () => {
  it('days left when > 1 day', () => {
    // period ends 2026-09-01 (IST midnight = 2026-08-31T18:30Z). now = 2026-08-29 12:00Z.
    const r = timeLeft('2026-09-01', new Date('2026-08-29T12:00:00Z'));
    expect(r.expired).toBe(false); expect(r.days).toBeGreaterThanOrEqual(2); expect(r.label).toMatch(/days left/);
  });
  it('hours left when < 1 day', () => {
    // period ends 2026-09-01 (IST midnight 08-31T18:30Z). now = 2026-08-31T12:00Z (~6.5h before).
    const r = timeLeft('2026-09-01', new Date('2026-08-31T12:00:00Z'));
    expect(r.expired).toBe(false); expect(r.days).toBe(0); expect(r.hours).toBeGreaterThan(0); expect(r.label).toMatch(/hours? left/);
  });
  it('expired at/after end', () => {
    const r = timeLeft('2026-09-01', new Date('2026-09-02T00:00:00Z'));
    expect(r.expired).toBe(true); expect(r.label).toBe('Expired');
  });
  it('TERMS has 4 entries', () => { expect(Object.keys(TERMS).length).toBe(4); });
});
describe('signatures', () => {
  const secret = 'testsecret';
  it('payment signature verifies', () => {
    const sig = crypto.createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
    expect(verifyPaymentSignature('order_1', 'pay_1', sig, secret)).toBe(true);
    expect(verifyPaymentSignature('order_1', 'pay_1', 'deadbeef', secret)).toBe(false);
  });
  it('webhook signature verifies over raw body', () => {
    const body = '{"event":"subscription.charged"}';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, sig + '00', secret)).toBe(false);
  });
});
