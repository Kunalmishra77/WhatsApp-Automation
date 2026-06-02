import { createAdminClient } from '@/services/supabase/admin';
import { getLimits } from '@/lib/plan-features';
import { getUsage } from '@/lib/usage-tracker';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanLimitError';
  }
}

// ---------------------------------------------------------------------------
// Workspace plan lookup
// ---------------------------------------------------------------------------

export async function getWorkspacePlan(workspaceId: string): Promise<string> {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('workspaces')
      .select('plan')
      .eq('id', workspaceId)
      .single();

    if (error || !data) return 'free';
    return (data.plan as string) ?? 'free';
  } catch (err) {
    console.error('[plan-guard] getWorkspacePlan failed:', err);
    return 'free';
  }
}

// ---------------------------------------------------------------------------
// Guards — throw PlanLimitError if the workspace has hit its limit
// ---------------------------------------------------------------------------

export async function guardMessageLimit(
  workspaceId: string,
  plan: string
): Promise<void> {
  let usage;
  try {
    usage = await getUsage(workspaceId);
  } catch (err) {
    console.error('[plan-guard] guardMessageLimit: usage fetch failed, allowing through:', err);
    return;
  }

  const limits = getLimits(plan);
  const limit = limits.maxMessages;

  if (limit !== -1 && usage.messages_sent >= limit) {
    throw new PlanLimitError(
      `Monthly message limit reached (${usage.messages_sent}/${limit}). ` +
        `Upgrade your plan to send more messages.`
    );
  }
}

export async function guardCampaignLimit(
  workspaceId: string,
  plan: string
): Promise<void> {
  let usage;
  try {
    usage = await getUsage(workspaceId);
  } catch (err) {
    console.error('[plan-guard] guardCampaignLimit: usage fetch failed, allowing through:', err);
    return;
  }

  const limits = getLimits(plan);
  const limit = limits.maxCampaigns;

  if (limit !== -1 && usage.campaigns_run >= limit) {
    throw new PlanLimitError(
      `Monthly campaign limit reached (${usage.campaigns_run}/${limit}). ` +
        `Upgrade your plan to run more campaigns.`
    );
  }
}

export async function guardContactLimit(
  workspaceId: string,
  plan: string
): Promise<void> {
  let usage;
  try {
    usage = await getUsage(workspaceId);
  } catch (err) {
    console.error('[plan-guard] guardContactLimit: usage fetch failed, allowing through:', err);
    return;
  }

  const limits = getLimits(plan);
  const limit = limits.maxContacts;

  if (limit !== -1 && usage.contacts_created >= limit) {
    throw new PlanLimitError(
      `Contact limit reached (${usage.contacts_created}/${limit}). ` +
        `Upgrade your plan to add more contacts.`
    );
  }
}

// ---------------------------------------------------------------------------
// Response helper — returns a 402 Response if error is a PlanLimitError
// ---------------------------------------------------------------------------

export function planLimitResponse(error: unknown): Response | null {
  if (error instanceof PlanLimitError) {
    return new Response(
      JSON.stringify({ error: error.message, code: 'PLAN_LIMIT_EXCEEDED' }),
      {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  return null;
}
