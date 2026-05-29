/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

export type MessageRow = Database['public']['Tables']['messages']['Row'];

const PAGE_SIZE = 50;

export async function fetchMessages(
  conversationId: string,
  page = 0,
): Promise<MessageRow[]> {
  const supabase = createClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return (data ?? []).reverse() as MessageRow[];
}

export async function sendMessage(payload: {
  conversationId: string;
  workspaceId: string;
  senderId: string;
  content: string;
  type?: Database['public']['Tables']['messages']['Row']['type'];
  replyToId?: string;
}): Promise<MessageRow> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: payload.conversationId,
      workspace_id: payload.workspaceId,
      sender_id: payload.senderId,
      sender_type: 'agent',
      direction: 'outbound',
      type: payload.type ?? 'text',
      content: payload.content,
      reply_to_id: payload.replyToId ?? null,
      status: 'queued',
    })
    .select()
    .single();

  if (error) throw error;
  return data as MessageRow;
}

export async function sendInternalNote(payload: {
  conversationId: string;
  workspaceId: string;
  senderId: string;
  content: string;
}): Promise<MessageRow> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: payload.conversationId,
      workspace_id: payload.workspaceId,
      sender_id: payload.senderId,
      sender_type: 'agent',
      direction: 'outbound',
      type: 'internal_note',
      content: payload.content,
      status: 'sent',
    })
    .select()
    .single();

  if (error) throw error;
  return data as MessageRow;
}
