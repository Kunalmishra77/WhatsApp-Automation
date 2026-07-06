import { createAdminClient } from '@/services/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

// Generic function: reads a sheets webhook URL from workspace settings (any key)
// and POSTs the payload to it. Fire-and-forget — caller should .catch(() => {}).
export async function notifyWorkspaceSheets(
  supabase: AdminClient,
  workspaceId: string,
  settingsKey: string,
  payload: Record<string, string>,
): Promise<void> {
  const { data: ws } = await (supabase as any)
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single();

  const webhookUrl = (ws?.settings as Record<string, unknown> | null)?.[settingsKey] as string | undefined;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
