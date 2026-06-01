/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type CampaignRow = Database['public']['Tables']['campaigns']['Row'];

export const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  scheduled: 'bg-brand-100 text-brand-700',
  running:   'bg-amber-100 text-amber-700',
  paused:    'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-700',
};

export type CampaignWithTemplate = CampaignRow & {
  templates: { name: string; body: string } | null;
};

export async function fetchCampaigns(workspaceId: string): Promise<CampaignWithTemplate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, templates(name, body)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CampaignWithTemplate[];
}

export async function createCampaign(
  workspaceId: string,
  userId: string,
  payload: {
    name: string;
    template_id: string;
    audience_type: string;
    audience_filter: Record<string, unknown>;
    scheduled_at?: string;
    media_id?: string;
    media_type?: string;
  },
): Promise<CampaignRow> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      workspace_id:    workspaceId,
      created_by:      userId,
      name:            payload.name,
      template_id:     payload.template_id,
      audience_type:   payload.audience_type,
      audience_filter: payload.audience_filter,
      scheduled_at:    payload.scheduled_at ?? null,
      status:          payload.scheduled_at ? 'scheduled' : 'draft',
      media_id:        payload.media_id   ?? null,
      media_type:      payload.media_type ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CampaignRow;
}

export async function updateCampaignStatus(
  id: string,
  status: Database['public']['Tables']['campaigns']['Row']['status'],
): Promise<void> {
  const supabase = createClient() as any;
  const { error } = await supabase.from('campaigns').update({ status }).eq('id', id);
  if (error) throw error;
}
