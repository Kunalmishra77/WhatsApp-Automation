// lib/tenant-health.ts — pure tenant silent-detection logic.

export const TENANT_HEALTH = {
  MIN_BASELINE_INBOUND: 20, // established-tenant floor over the baseline window
  RECENT_HOURS: 48,         // "gone dark" window
  BASELINE_FROM_DAYS: 16,   // baseline window start (days ago)
  BASELINE_TO_DAYS: 2,      // baseline window end (days ago)
} as const;

export type TenantStatus = 'ok' | 'silent';

// A workspace is silent only if it is active, was established (enough baseline
// inbound), and has received zero inbound in the recent window.
export function classifyTenant(
  row: { is_active: boolean; baseline_count: number; recent_count: number },
  minBaseline: number = TENANT_HEALTH.MIN_BASELINE_INBOUND,
): TenantStatus {
  if (!row.is_active) return 'ok';
  if (row.baseline_count < minBaseline) return 'ok';
  if (row.recent_count > 0) return 'ok';
  return 'silent';
}

// Workspaces that transitioned INTO silent since the last run (prior status not
// 'silent' — covers both ok→silent and no-prior→silent). Still-silent and
// recovered are excluded.
export function diffNewlySilent(
  prev: Map<string, TenantStatus>,
  current: Array<{ workspace_id: string; status: TenantStatus }>,
): string[] {
  return current
    .filter((c) => c.status === 'silent' && prev.get(c.workspace_id) !== 'silent')
    .map((c) => c.workspace_id);
}
