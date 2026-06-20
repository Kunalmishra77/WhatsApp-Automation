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
  live_total:     number;
  live_sent:      number;
  live_delivered: number;
  live_read:      number;
  live_replied:   number;
  live_failed:    number;
};

export async function fetchCampaigns(workspaceId: string): Promise<CampaignWithTemplate[]> {
  const res = await fetch(`/api/campaigns/list?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch campaigns');
  return res.json() as Promise<CampaignWithTemplate[]>;
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? 'Failed to delete campaign');
  }
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
    media_caption?: string;
    text_content?: string;
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
      media_id:        payload.media_id      ?? null,
      media_type:      payload.media_type    ?? null,
      media_caption:   payload.media_caption ?? null,
      text_content:    payload.text_content  ?? null,
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
