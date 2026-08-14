import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type ConversationRow = Database['public']['Tables']['conversations']['Row'];
export type ConversationWithContact = ConversationRow & {
  contacts: {
    id: string;
    name: string | null;
    phone: string;
    avatar_url: string | null;
  };
};

// ── Server-side search (GET /api/conversations/search) ─────────────────────────
// Replaces the old direct-browser-supabase fetchConversations(): filtering,
// pagination and the reporting summary now live server-side so counts stay
// exact past PostgREST's 1000-row default cap. `status: 'mine'` is resolved
// client-side to the current user's id before hitting the API, since the API
// has no concept of "the calling user" beyond auth/workspace membership.
export interface ConversationSearchFilters {
  workspaceId: string;
  quick?: string;
  from?: string;
  to?: string;
  channel?: string;
  status?: string;
  campaign_id?: string;
  temperature?: string;
  stage?: string;
  flag?: string;
  assigned_agent_id?: string;
  label?: string;
  sentiment?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ConversationSearchSummary {
  new_today: number;
  new_week: number;
  new_month: number;
  hot: number;
  warm: number;
  cold: number;
  unanswered: number;
  unread: number;
  total: number;
}

export interface ConversationSearchResponse {
  conversations: ConversationWithContact[];
  total: number;
  // Only computed on the first page (offset 0) — "load more" requests (offset > 0)
  // return null since the UI only ever reads pages[0].summary (see useConversations).
  summary: ConversationSearchSummary | null;
}

export async function searchConversations(
  filters: ConversationSearchFilters,
): Promise<ConversationSearchResponse> {
  const { workspaceId, status, ...rest } = filters;

  let resolvedStatus = status;
  if (status === 'mine') {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    resolvedStatus = undefined;
    if (user) (rest as Record<string, unknown>).assigned_agent_id = filters.assigned_agent_id ?? user.id;
  }
  // 'all' means "no status filter" — the API treats an absent `status` param that way.
  if (resolvedStatus === 'all') resolvedStatus = undefined;
  // 'spam' is expressed via the `flag=spam` param server-side (is_spam=true), not `status`.
  let flag = rest.flag;
  if (resolvedStatus === 'spam') {
    resolvedStatus = undefined;
    flag = flag ?? 'spam';
  }

  const params = new URLSearchParams({ workspaceId });
  const entries: Array<[string, string | number | undefined]> = [
    ['status', resolvedStatus],
    ['quick', rest.quick],
    ['from', rest.from],
    ['to', rest.to],
    ['channel', rest.channel],
    ['campaign_id', rest.campaign_id],
    ['temperature', rest.temperature],
    ['stage', rest.stage],
    ['flag', flag],
    ['assigned_agent_id', rest.assigned_agent_id],
    ['label', rest.label],
    ['sentiment', rest.sentiment],
    ['q', rest.q],
    ['limit', rest.limit],
    ['offset', rest.offset],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }

  const res = await fetch(`/api/conversations/search?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Failed to load conversations (${res.status})`);
  }
  return res.json() as Promise<ConversationSearchResponse>;
}

export async function fetchConversation(id: string): Promise<ConversationWithContact | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select(`*, contacts(id, name, phone, avatar_url)`)
    .eq('id', id)
    .single();
  if (error) return null;
  return data as ConversationWithContact;
}

export async function updateConversationStatus(
  id: string,
  status: Database['public']['Tables']['conversations']['Row']['status'],
) {
  const supabase = createClient();
  const { error } = await supabase
    .from('conversations')
    .update({
      status,
      ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
    } as never)
    .eq('id', id);
  if (error) throw error;
}

export async function assignConversation(id: string, agentId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('conversations')
    .update({
      assigned_agent_id: agentId,
      status: 'assigned',
    } as never)
    .eq('id', id);
  if (error) throw error;
}

export async function markConversationRead(conversationId: string) {
  // Calls backend which: (1) resets unread count in DB, (2) sends WhatsApp read receipt (blue tick)
  await fetch(`/api/conversations/${conversationId}/mark-read`, { method: 'POST' });
}
