import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { createAdminClient } from '@/services/supabase/admin';
import { computeAmounts, planKeyFor, type Term } from '@/lib/billing';
import { ReactivateButton } from './ReactivateButton';

interface PayableSubscription {
  workspaceId: string;
  hasInstagram: boolean;
  term: Term;
  amountPaise: number;
}

// Resolves the same "current workspace" the (dashboard) layout would (preferred
// cookie, else first membership), then what it owes right now, so the button
// below can charge the exact reactivation amount. Returns null when there's
// nothing payable to show (no workspace / no matching plan) — callers fall
// back to support links rather than rendering a broken button.
async function resolvePayable(userId: string): Promise<PayableSubscription | null> {
  const workspaces = await getUserWorkspaces(userId);
  if (workspaces.length === 0) return null;

  const db = createAdminClient() as any;
  const cookieStore = await cookies();
  const preferredId = cookieStore.get('active_workspace_id')?.value;
  const preferredWs = preferredId ? workspaces.find((w) => w.id === preferredId) : undefined;
  const activeWorkspace = preferredWs ?? workspaces[0]!;

  const { data: ws } = await db
    .from('workspaces')
    .select('is_active')
    .eq('id', activeWorkspace.id)
    .single();

  // Already reactivated (e.g. they paid in another tab, or hit back after
  // verify redirected them) — send them straight through instead of showing
  // a "pay to reactivate" screen for a workspace that no longer needs it.
  if (ws?.is_active === true) redirect('/dashboard');

  const { data: subData } = await db
    .from('subscriptions')
    .select('has_instagram, term')
    .eq('workspace_id', activeWorkspace.id)
    .maybeSingle();

  const hasInstagram = subData?.has_instagram ?? false;
  const term: Term = (subData?.term as Term | undefined) ?? 'monthly';
  const planKey = planKeyFor(hasInstagram);

  const { data: planRow } = await db
    .from('billing_plans')
    .select('base_paise')
    .eq('key', planKey)
    .eq('term', term)
    .eq('active', true)
    .maybeSingle();

  if (!planRow) return null;

  const { totalPaise } = computeAmounts(planRow.base_paise);
  return { workspaceId: activeWorkspace.id, hasInstagram, term, amountPaise: totalPaise };
}

export default async function PaymentRequiredPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const payable = await resolvePayable(user.id);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-brand-500/30">
            A
          </div>
        </div>

        {/* Icon + Title */}
        <div className="space-y-2">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-2xl font-bold text-foreground">Subscription Paused</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your Agentix subscription payment could not be processed and your account has been temporarily paused.
          </p>
        </div>

        {/* Data safe notice */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✅ Your data is completely safe — nothing has been deleted.
        </div>

        {/* CTA */}
        <div className="space-y-3">
          {payable && (
            <ReactivateButton
              workspaceId={payable.workspaceId}
              hasInstagram={payable.hasInstagram}
              term={payable.term}
              amountPaise={payable.amountPaise}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Questions?{' '}
            <a href="https://wa.me/919125000000" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              WhatsApp us
            </a>
            {' '}or{' '}
            <a href="mailto:support@agentix.in" className="underline hover:text-foreground">
              email support
            </a>
          </p>
        </div>

        {/* Sign out link */}
        <p className="text-xs text-muted-foreground">
          Wrong account?{' '}
          <Link href="/login" className="underline hover:text-foreground">Sign in with a different account</Link>
        </p>
      </div>
    </div>
  );
}
