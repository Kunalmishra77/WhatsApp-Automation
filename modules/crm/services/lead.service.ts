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

export type LeadWithContact = LeadRow & {
  contacts: { name: string | null; phone: string; avatar_url: string | null } | null;
};

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
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('leads')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as LeadRow;
}

export async function updateLeadStage(id: string, stage: LeadStage): Promise<void> {
  const supabase = createClient() as any;
  const { error } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}
