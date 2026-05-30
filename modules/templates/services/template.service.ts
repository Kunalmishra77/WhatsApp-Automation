/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type TemplateRow = Database['public']['Tables']['templates']['Row'];
export type TemplateInsert = Database['public']['Tables']['templates']['Insert'];
export type TemplateUpdate = Database['public']['Tables']['templates']['Update'];

export const TEMPLATE_STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  paused:   'bg-gray-100 text-gray-600',
};

export const CATEGORY_LABELS: Record<string, string> = {
  authentication: 'Authentication',
  marketing:      'Marketing',
  utility:        'Utility',
};

export async function fetchTemplates(workspaceId: string): Promise<TemplateRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TemplateRow[];
}

export async function createTemplate(
  workspaceId: string,
  payload: Omit<TemplateInsert, 'workspace_id'>,
): Promise<TemplateRow> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('templates')
    .insert({ ...payload, workspace_id: workspaceId })
    .select()
    .single();
  if (error) throw error;
  return data as TemplateRow;
}

export async function updateTemplate(id: string, payload: TemplateUpdate): Promise<TemplateRow> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('templates')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TemplateRow;
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}

export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
  return [...new Set(matches)];
}
