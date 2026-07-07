import { createAdminClient } from '@/services/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

// Reads workspace settings for the first matching key and POSTs payload to that URL.
// Accepts a single key string or an array of keys (tries in order, uses first found).
// Fire-and-forget — caller should .catch(() => {}).
export async function notifyWorkspaceSheets(
  supabase: AdminClient,
  workspaceId: string,
  settingsKey: string | string[],
  payload: Record<string, string>,
): Promise<void> {
  const { data: ws } = await (supabase as any)
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single();

  const settings = (ws?.settings as Record<string, unknown> | null) ?? {};
  const keys = Array.isArray(settingsKey) ? settingsKey : [settingsKey];
  const webhookUrl = keys.map((k) => settings[k]).find(Boolean) as string | undefined;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
