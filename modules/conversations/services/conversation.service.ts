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

export async function fetchConversations(
  workspaceId: string,
  status?: string,
): Promise<ConversationWithContact[]> {
  const supabase = createClient();
  let query = supabase
    .from('conversations')
    .select(`*, contacts(id, name, phone, avatar_url)`)
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (status === 'mine') {
    // Filter by current user's assigned conversations
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      query = (query as any).eq('assigned_agent_id', user.id);
    }
  } else if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ConversationWithContact[];
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
  const supabase = createClient();
  // Reset unread count on conversation
  await supabase
    .from('conversations')
    .update({ unread_count: 0 } as never)
    .eq('id', conversationId);
}
