import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { getKeyId, verifyPaymentSignature, verifyWebhookSignature } from '@/lib/razorpay';

// No network: this file never calls razorpayFetch/createOrder/createSubscription/etc.

describe('getKeyId', () => {
  const ORIGINAL = process.env.RAZORPAY_KEY_ID;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = ORIGINAL;
  });

  it('throws when RAZORPAY_KEY_ID is unset', () => {
    delete process.env.RAZORPAY_KEY_ID;
    expect(() => getKeyId()).toThrow('RAZORPAY_KEY_ID');
  });

  it('throws when RAZORPAY_KEY_ID is blank/whitespace', () => {
    process.env.RAZORPAY_KEY_ID = '   ';
    expect(() => getKeyId()).toThrow('RAZORPAY_KEY_ID');
  });

  it('returns the cleaned key id when set', () => {
    process.env.RAZORPAY_KEY_ID = '﻿ "rzp_test_123" \n';
    expect(getKeyId()).toBe('rzp_test_123');
  });
});

describe('re-exported signature verifiers (same vectors as Task 1)', () => {
  const secret = 'testsecret';

  it('verifyPaymentSignature verifies HMAC over orderId|paymentId', () => {
    const sig = crypto.createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
    expect(verifyPaymentSignature('order_1', 'pay_1', sig, secret)).toBe(true);
    expect(verifyPaymentSignature('order_1', 'pay_1', 'deadbeef', secret)).toBe(false);
  });

  it('verifyWebhookSignature verifies HMAC over raw body', () => {
    const body = '{"event":"subscription.charged"}';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, sig + '00', secret)).toBe(false);
  });
});
