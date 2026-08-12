'use client';

import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { toast } from 'sonner';

// The Razorpay Checkout.js global is loaded dynamically (it's not an npm package),
// so it's typed loosely rather than via a `declare global` augmentation.
type RazorpayInstance = { open: () => void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

function getRazorpayCtor(): RazorpayCtor | undefined {
  return (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (getRazorpayCtor()) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load Razorpay checkout script'));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

interface CheckoutManualResponse {
  mode: 'manual';
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  name: string;
}
interface CheckoutAutoResponse {
  mode: 'auto';
  subscription_id: string;
  key_id: string;
}
interface CheckoutErrorResponse {
  error: string;
}
type CheckoutResponse = CheckoutManualResponse | CheckoutAutoResponse | CheckoutErrorResponse;

interface VerifyResponse {
  ok?: boolean;
  invoice_no?: string;
  error?: string;
}

interface RazorpayHandlerResponse {
  razorpay_order_id?: string;
  razorpay_payment_id: string;
  razorpay_signature?: string;
  razorpay_subscription_id?: string;
}

interface CheckoutButtonProps {
  workspaceId: string;
  hasInstagram: boolean;
  mode: 'manual' | 'auto';
  label: string;
  busyLabel?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  disabled?: boolean;
  /** Called once the payment is confirmed (manual: server-verified; auto: Checkout handler fired, webhook finalizes async). */
  onSuccess: () => void;
}

// Pay Now (manual) / Enable auto-pay button. Loads Checkout.js on demand, asks
// /api/billing/checkout for an order (manual) or subscription (auto) — amounts
// always come back from the server, never from anything this component sends —
// then opens Razorpay Checkout against that order/subscription id.
export function CheckoutButton({
  workspaceId,
  hasInstagram,
  mode,
  label,
  busyLabel,
  variant,
  size,
  className,
  disabled,
  onSuccess,
}: CheckoutButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!workspaceId || busy) return;
    setBusy(true);
    let modalOpened = false;
    try {
      await loadRazorpayScript();
      const Razorpay = getRazorpayCtor();
      if (!Razorpay) {
        toast.error('Could not load the payment window. Check your connection and try again.');
        return;
      }

      const checkoutRes = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, has_instagram: hasInstagram, mode }),
      });
      const checkoutData = (await checkoutRes.json()) as CheckoutResponse;

      if (!checkoutRes.ok || 'error' in checkoutData) {
        toast.error(('error' in checkoutData && checkoutData.error) || 'Could not start checkout');
        return;
      }

      // Guard: never open Checkout without a resolved order/subscription to charge against.
      if (checkoutData.mode === 'manual' && !checkoutData.order_id) {
        toast.error('Payment order was not created');
        return;
      }
      if (checkoutData.mode === 'auto' && !checkoutData.subscription_id) {
        toast.error('Subscription was not created');
        return;
      }

      const options: Record<string, unknown> = {
        key: checkoutData.key_id,
        name: checkoutData.mode === 'manual' ? checkoutData.name : 'Razorveda',
        theme: { color: '#111827' },
        modal: { ondismiss: () => setBusy(false) },
        handler: (response: RazorpayHandlerResponse) => {
          if (checkoutData.mode === 'manual') {
            void (async () => {
              try {
                const verifyRes = await fetch('/api/billing/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    workspaceId,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                  }),
                });
                const verifyData = (await verifyRes.json()) as VerifyResponse;
                if (!verifyRes.ok || !verifyData.ok) {
                  toast.error(verifyData.error ?? 'Payment could not be verified');
                  return;
                }
                toast.success(`Payment received${verifyData.invoice_no ? ` — invoice ${verifyData.invoice_no}` : ''}`);
                onSuccess();
              } catch {
                toast.error('Payment could not be verified — contact support if you were charged');
              } finally {
                setBusy(false);
              }
            })();
          } else {
            // Auto-pay: Razorpay confirmed the mandate/first charge client-side.
            // Activation is finalized server-side by the webhook (not verified here),
            // so just prompt a refresh — the caller re-polls for the async update.
            toast.success('Payment authorized — activating auto-pay…');
            onSuccess();
            setBusy(false);
          }
        },
      };

      if (checkoutData.mode === 'manual') {
        options.order_id = checkoutData.order_id;
        options.amount = checkoutData.amount;
        options.currency = checkoutData.currency;
      } else {
        options.subscription_id = checkoutData.subscription_id;
      }

      const rzp = new Razorpay(options);
      modalOpened = true;
      rzp.open();
    } catch {
      toast.error('Something went wrong starting checkout');
    } finally {
      if (!modalOpened) setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} className={className} disabled={disabled || busy} onClick={() => void handleClick()}>
      {busy ? (busyLabel ?? 'Processing…') : label}
    </Button>
  );
}
