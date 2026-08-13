// lib/billing-guard.ts — API-layer suspension guard for the one-plan billing model.
//
// SAFETY CONTRACT (do not weaken):
//   1. Every function here FAILS OPEN. Any DB error / exception / unexpected
//      shape → treat the workspace as ACTIVE. We never want a billing-guard
//      bug to silently stop bot replies or blocked sends for a paying (or
//      not-yet-migrated) client.
//   2. A workspace with NO `subscriptions` row is ACTIVE. Existing clients
//      have no row until the cutover-seeding step runs — absence of a row is
//      NOT suspension.
//   3. A workspace is blocked ONLY when explicitly suspended:
//        subscriptions.status = 'suspended'
//        OR workspaces.is_active = false
//      Every other status ('pending' | 'active' | 'past_due' | 'cancelled') is
//      allowed here — a 'cancelled' subscription keeps access until its
//      current_period_end passes, at which point the billing-sweep cron flips
//      workspaces.is_active=false (which this guard DOES block on).
import { createAdminClient } from '@/services/supabase/admin';
import type { SubStatus } from '@/lib/billing';

export type BillingDb = ReturnType<typeof createAdminClient>;

export interface BillingState {
  status: SubStatus | null;
  isActive: boolean;
  hasInstagram: boolean;
}

const FAIL_OPEN_STATE: BillingState = { status: null, isActive: true, hasInstagram: false };

export class SuspendedError extends Error {
  constructor(message = 'Workspace subscription is inactive') {
    super(message);
    this.name = 'SuspendedError';
  }
}

// getBillingState — reads subscriptions (may not exist yet) + workspaces.is_active.
// Never throws: any error resolves to the fail-open state above.
export async function getBillingState(db: BillingDb, workspaceId: string): Promise<BillingState> {
  try {
    if (!workspaceId) return FAIL_OPEN_STATE;

    const anyDb = db as any;
    const [subRes, wsRes] = await Promise.all([
      anyDb.from('subscriptions').select('status, has_instagram').eq('workspace_id', workspaceId).maybeSingle(),
      anyDb.from('workspaces').select('is_active').eq('id', workspaceId).maybeSingle(),
    ]);

    // Any DB-level error → fail open. Do NOT try to interpret a partial result.
    if (subRes?.error || wsRes?.error) {
      console.error('[billing-guard] getBillingState query error, failing open:', subRes?.error ?? wsRes?.error);
      return FAIL_OPEN_STATE;
    }

    const sub = subRes?.data as { status?: string; has_instagram?: boolean } | null;
    const ws = wsRes?.data as { is_active?: boolean } | null;

    // No subscription row yet (pre-cutover client) → active.
    // NOTE: 'cancelled' is intentionally NOT blocking here — a cancelled sub
    // retains access until current_period_end, when the billing-sweep cron
    // sets workspaces.is_active=false (which IS blocking, below).
    const status = (sub?.status ?? null) as SubStatus | null;
    const suspendedByStatus = status === 'suspended';
    const suspendedByWorkspace = ws?.is_active === false;

    return {
      status,
      isActive: !(suspendedByStatus || suspendedByWorkspace),
      hasInstagram: sub?.has_instagram === true,
    };
  } catch (err) {
    console.error('[billing-guard] getBillingState threw, failing open:', err);
    return FAIL_OPEN_STATE;
  }
}

// assertWorkspaceActive — throws SuspendedError ONLY when getBillingState cleanly
// resolves isActive=false. Any internal error is swallowed here too (belt +
// braces on top of getBillingState's own fail-open behavior) so a bug in this
// module can never take down the send/reply path.
export async function assertWorkspaceActive(db: BillingDb, workspaceId: string): Promise<void> {
  let state: BillingState;
  try {
    state = await getBillingState(db, workspaceId);
  } catch (err) {
    console.error('[billing-guard] assertWorkspaceActive: getBillingState threw, allowing through:', err);
    return;
  }

  if (!state.isActive) {
    throw new SuspendedError();
  }
}

// suspendedResponse — standard 402 payload for API routes to return when
// assertWorkspaceActive throws SuspendedError.
export function suspendedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'subscription_inactive', code: 'SUBSCRIPTION_INACTIVE' }),
    { status: 402, headers: { 'content-type': 'application/json' } },
  );
}
