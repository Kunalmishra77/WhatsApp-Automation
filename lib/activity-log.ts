import { headers } from 'next/headers';
import { createAdminClient } from '@/services/supabase/admin';

/**
 * One entry in the workspace activity trail (public.activities).
 *
 * Writes here must never break the action they describe, so every failure is
 * swallowed and logged. Call it AFTER the mutation has succeeded.
 */
export interface ActivityInput {
  workspaceId: string;
  /** The profile that performed the action. Null for system/cron actions. */
  actorId?: string | null;
  /** Dotted, past-tense key: 'team.role_changed', 'campaign.sent', 'kb.deleted'. */
  action: string;
  /** What kind of thing was acted on: 'workspace_member', 'contact', 'campaign'… */
  entityType: string;
  entityId?: string | null;
  /** Human-readable name, captured now so the trail survives the entity's deletion. */
  entityLabel?: string | null;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget audit write. Never throws, never blocks the caller's result. */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      const h = await headers();
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
      ua = h.get('user-agent') ?? null;
    } catch {
      // Outside a request context (cron, scripts) — no client info to record.
    }

    const db = createAdminClient() as any;
    await db.from('activities').insert({
      workspace_id: input.workspaceId,
      actor_id:     input.actorId ?? null,
      action:       input.action,
      entity_type:  input.entityType,
      entity_id:    input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      metadata:     input.metadata ?? {},
      ip_address:   ip,
      user_agent:   ua,
    });
  } catch (err) {
    console.error('[activity-log] failed to record', input.action, err);
  }
}

export { ACTIVITY_LABELS, activityLabel } from '@/lib/activity-labels';
