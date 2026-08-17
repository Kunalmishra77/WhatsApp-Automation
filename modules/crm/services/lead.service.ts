/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type LeadRow = Database['public']['Tables']['leads']['Row'];
export type LeadStage = Database['public']['Tables']['leads']['Row']['stage'];
export type LeadInsert = Database['public']['Tables']['leads']['Insert'];
export type LeadUpdate = Database['public']['Tables']['leads']['Update'];

export const LEAD_STAGES: LeadStage[] = [
  'new', 'contacted', 'follow_up', 'interested', 'converted', 'lost',
];

export const STAGE_LABELS: Record<LeadStage, string> = {
  new:        'New',
  contacted:  'Contacted',
  follow_up:  'Follow Up',
  interested: 'Interested',
  converted:  'Converted',
  lost:       'Lost',
};

export const STAGE_COLORS: Record<LeadStage, string> = {
  new:        'bg-gray-100 text-gray-700',
  contacted:  'bg-brand-100 text-brand-700',
  follow_up:  'bg-amber-100 text-amber-700',
  interested: 'bg-violet-100 text-violet-700',
  converted:  'bg-emerald-100 text-emerald-700',
  lost:       'bg-red-100 text-red-700',
};

// The AI pipeline columns added by migration 074 — not yet present in the generated
// `database.types.ts` (DB types are not regenerated as part of this task). Defined
// here and intersected onto the lead types the CRM UI consumes; every field is
// possibly-null/undefined so the UI renders defensively if a deploy hasn't run the
// migration yet.
export type LeadAIFields = {
  stage_source?: 'ai' | 'manual' | null;
  stage_reason?: string | null;
  ai_stage_confidence?: number | null;
  ai_classified_at?: string | null;
  needs_follow_up?: boolean | null;
  follow_up_reason?: string | null;
  converted_signal?: string | null;
  conversion_reviewed?: boolean | null;
};

export type LeadStageHistoryRow = {
  id: string;
  lead_id: string;
  from_stage: string | null;
  to_stage: string;
  source: 'ai' | 'manual';
  reason: string | null;
  confidence: number | null;
  actor_id: string | null;
  created_at: string;
};

export type LeadWithContact = LeadRow & LeadAIFields & {
  contacts: { name: string | null; phone: string; avatar_url: string | null } | null;
};

// True when a lead should surface in the "Needs follow-up" view: either the AI
// classifier flagged it, or its follow_up_at has passed. Stage exclusion
// (converted/lost) is left to call sites since it varies by context (Kanban
// column vs. a flat list).
export function leadNeedsFollowUp(lead: LeadAIFields & { follow_up_at: string | null }): boolean {
  const flagged = lead.needs_follow_up === true;
  const overdue = !!lead.follow_up_at && new Date(lead.follow_up_at).getTime() <= Date.now();
  return flagged || overdue;
}

export async function fetchLeadsByStage(
  workspaceId: string,
): Promise<Record<LeadStage, LeadWithContact[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*, contacts(name, phone, avatar_url)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const grouped = Object.fromEntries(
    LEAD_STAGES.map((s) => [s, []]),
  ) as unknown as Record<LeadStage, LeadWithContact[]>;

  for (const lead of (data ?? []) as LeadWithContact[]) {
    grouped[lead.stage].push(lead);
  }
  return grouped;
}

export async function createLead(
  workspaceId: string,
  payload: Omit<LeadInsert, 'workspace_id'>,
): Promise<LeadRow> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...payload, workspace_id: workspaceId })
    .select()
    .single();
  if (error) throw error;
  return data as LeadRow;
}

export async function updateLead(id: string, payload: LeadUpdate): Promise<LeadRow> {
  const { stage, ...rest } = payload;

  // Route a stage change through updateLeadStage (the PATCH route, admin client) so
  // stage_source='manual' + the lead_stage_history audit row get recorded — the RLS
  // client below has no INSERT policy on lead_stage_history and no way to know the
  // lead's prior stage for the history row's from_stage. Excluded from `rest` so it
  // isn't written twice; updateLeadStage itself only logs history when the stage
  // actually differs from the current one.
  if (stage !== undefined) {
    await updateLeadStage(id, stage as LeadStage);
  }

  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('leads')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as LeadRow;
}

export async function updateLeadStage(id: string, stage: LeadStage): Promise<void> {
  // Routed through the PATCH API (admin client) rather than a direct table update:
  // `lead_stage_history` only grants SELECT under RLS (writes are admin-client only,
  // see migration 074), so recording provenance + the audit-trail row for this manual
  // move requires the server-side route.
  const res = await fetch(`/api/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? 'Failed to update lead stage');
  }
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// `lead_stage_history` isn't in the generated Database types (migration 074 added
// it after the last `supabase gen types` run). The RLS SELECT policy
// (lead_stage_history_workspace_isolation) allows workspace members to read it
// directly with the anon/RLS client — no API route needed.
export async function fetchLeadStageHistory(leadId: string): Promise<LeadStageHistoryRow[]> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('lead_stage_history')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadStageHistoryRow[];
}

// On-demand re-analyze — POSTs the classify route (Task 4), which runs the same
// AI classifier the inbound webhook triggers automatically and returns the
// refreshed lead row.
export async function reclassifyLead(id: string): Promise<LeadRow> {
  const res = await fetch(`/api/leads/${id}/classify`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? 'Failed to re-analyze lead');
  }
  const body = await res.json() as { lead?: LeadRow; ok?: boolean };
  if (!body.lead) throw new Error('Re-analyze produced no change to review');
  return body.lead;
}

// Confirm/undo an AI-marked conversion via the dedicated conversion route.
export async function reviewLeadConversion(id: string, action: 'confirm' | 'undo'): Promise<LeadRow> {
  const res = await fetch(`/api/leads/${id}/conversion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? 'Failed to update conversion review');
  }
  const body = await res.json() as { lead?: LeadRow };
  if (!body.lead) throw new Error('Conversion review did not return a lead');
  return body.lead;
}
