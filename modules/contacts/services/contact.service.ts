/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/services/supabase/client';
import { normalizePhone } from '@/lib/phone';
import type { Database } from '@/types/database.types';

export type ContactRow = Database['public']['Tables']['contacts']['Row'];
export type ContactInsert = Database['public']['Tables']['contacts']['Insert'];
export type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

export interface ContactFilters {
  search?: string;
  tags?: string[];
  is_blocked?: boolean;
  listId?: string;
}

export async function fetchContacts(
  workspaceId: string,
  filters: ContactFilters = {},
  page = 0,
  pageSize = 50,
): Promise<{ data: ContactRow[]; count: number }> {
  const supabase = createClient() as any;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const selectExpr = filters.listId
    ? '*, contact_list_members!inner(list_id)'
    : '*';

  let query = supabase
    .from('contacts')
    .select(selectExpr, { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.listId) {
    query = query.eq('contact_list_members.list_id', filters.listId);
  }
  if (filters.search?.trim()) {
    query = query.or(
      `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`,
    );
  }
  if (filters.tags?.length) {
    query = query.overlaps('tags', filters.tags);
  }
  if (filters.is_blocked !== undefined) {
    query = query.eq('is_blocked', filters.is_blocked);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: (data ?? []) as ContactRow[], count: count ?? 0 };
}

export async function fetchContact(id: string): Promise<ContactRow | null> {
  const supabase = createClient();
  const { data } = await supabase.from('contacts').select('*').eq('id', id).single();
  return data as ContactRow | null;
}

export async function createContact(
  workspaceId: string,
  payload: Omit<ContactInsert, 'workspace_id'>,
): Promise<ContactRow> {
  const supabase = createClient() as any;
  const phone = payload.phone ? normalizePhone(payload.phone) : payload.phone;
  const { data, error } = await supabase
    .from('contacts')
    .insert({ ...payload, phone, workspace_id: workspaceId })
    .select()
    .single();
  if (error) throw error;
  return data as ContactRow;
}

export async function updateContact(id: string, payload: ContactUpdate): Promise<ContactRow> {
  const supabase = createClient() as any;
  const phone = payload.phone ? normalizePhone(payload.phone) : payload.phone;
  const { data, error } = await supabase
    .from('contacts')
    .update({ ...payload, phone, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ContactRow;
}

export async function deleteContact(id: string): Promise<void> {
  // Use API route (admin client) to bypass RLS restrictions on delete
  const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? 'Failed to delete contact');
  }
}

export async function bulkImportContacts(
  workspaceId: string,
  rows: Array<{ phone: string; name?: string; email?: string; company?: string; tags?: string[] }>,
): Promise<{ inserted: number; skipped: number }> {
  const supabase = createClient() as any;

  const normalizedRows = rows
    .map((r) => ({ ...r, phone: normalizePhone(r.phone) }))
    .filter((r) => r.phone);

  const phones = normalizedRows.map((r) => r.phone);
  const { data: existing } = await supabase
    .from('contacts')
    .select('phone')
    .eq('workspace_id', workspaceId)
    .in('phone', phones);
  const existingPhones = new Set(((existing ?? []) as Array<{ phone: string }>).map((e) => e.phone));

  const toInsert = normalizedRows
    .filter((r) => !existingPhones.has(r.phone))
    .map((r) => ({ ...r, workspace_id: workspaceId, tags: r.tags ?? [] }));

  if (toInsert.length === 0) return { inserted: 0, skipped: rows.length };

  const { error } = await supabase.from('contacts').insert(toInsert);
  if (error) throw error;

  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}
