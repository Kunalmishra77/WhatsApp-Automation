import { createClient } from '@/services/supabase/client';
import { subDays, startOfDay, format } from 'date-fns';

export interface ConversationStats {
  total: number;
  open: number;
  resolved: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface MessageFunnel {
  sent: number;
  delivered: number;
  read: number;
}

export async function fetchConversationStats(workspaceId: string): Promise<ConversationStats> {
  const supabase = createClient();

  const [totalRes, openRes, resolvedRes] = await Promise.all([
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'open'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'resolved'),
  ]);

  return {
    total:    totalRes.count ?? 0,
    open:     openRes.count ?? 0,
    resolved: resolvedRes.count ?? 0,
  };
}

export async function fetchDailyConversations(
  workspaceId: string,
  days = 14,
): Promise<DailyCount[]> {
  const supabase = createClient();
  const since = startOfDay(subDays(new Date(), days)).toISOString();

  const { data, error } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('workspace_id', workspaceId)
    .gte('created_at', since);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (let i = days; i >= 0; i--) {
    counts[format(subDays(new Date(), i), 'MMM d')] = 0;
  }
  for (const row of (data ?? []) as Array<{ created_at: string }>) {
    const day = format(new Date(row.created_at), 'MMM d');
    if (day in counts) counts[day] = (counts[day] ?? 0) + 1;
  }

  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

export async function fetchMessageFunnel(workspaceId: string): Promise<MessageFunnel> {
  const supabase = createClient();

  const [sentRes, deliveredRes, readRes] = await Promise.all([
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('direction', 'outbound'),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'delivered'),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'read'),
  ]);

  return {
    sent:      sentRes.count ?? 0,
    delivered: deliveredRes.count ?? 0,
    read:      readRes.count ?? 0,
  };
}
