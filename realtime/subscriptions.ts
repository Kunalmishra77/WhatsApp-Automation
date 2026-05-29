import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Client = SupabaseClient<Database>;

const activeChannels = new Map<string, RealtimeChannel>();

export function getOrCreateChannel(client: Client, name: string): RealtimeChannel {
  const existing = activeChannels.get(name);
  if (existing) return existing;

  const channel = client.channel(name);
  activeChannels.set(name, channel);
  return channel;
}

export function removeChannel(client: Client, name: string): void {
  const channel = activeChannels.get(name);
  if (channel) {
    client.removeChannel(channel);
    activeChannels.delete(name);
  }
}

export function removeAllChannels(client: Client): void {
  for (const [name] of activeChannels) {
    removeChannel(client, name);
  }
}
