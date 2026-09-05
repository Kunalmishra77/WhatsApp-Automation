'use client';

import { CheckoutButton } from '@/modules/settings/components/BillingSettings/CheckoutButton';
import { rupees, type Term } from '@/lib/billing';

interface ReactivateButtonProps {
  workspaceId: string;
  hasInstagram: boolean;
  term: Term;
  amountPaise: number;
}

// Reuses the exact same checkout -> Razorpay Checkout.js -> verify flow as the
// in-dashboard BillingSettings page (via CheckoutButton), just wired to props
// resolved server-side by payment-required/page.tsx instead of the workspace
// store — this page renders outside the (dashboard) layout (and its is_active
// gate) so that store is never initialized here.
export function ReactivateButton({ workspaceId, hasInstagram, term, amountPaise }: ReactivateButtonProps) {
  return (
    <CheckoutButton
      workspaceId={workspaceId}
      hasInstagram={hasInstagram}
      mode="manual"
      term={term}
      label={`💳 Pay ₹${rupees(amountPaise)} to Reactivate`}
      busyLabel="Opening payment…"
      className="w-full h-auto justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
      // Verified server-side (workspaces.is_active=true) by /api/billing/verify —
      // a full navigation (not router.push) so the dashboard layout re-reads the
      // now-active workspace from scratch instead of any stale client cache.
      onSuccess={() => { window.location.href = '/dashboard'; }}
    />
  );
}
