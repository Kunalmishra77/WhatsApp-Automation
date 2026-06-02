import { createAdminClient } from '@/services/supabase/admin';

export interface UsageRow {
  workspace_id: string;
  month: string;
  messages_sent: number;
  messages_in: number;
  campaigns_run: number;
  contacts_created: number;
  updated_at?: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function ensureRow(
  db: any,
  workspaceId: string,
  month: string
): Promise<void> {
  await db
    .from('platform_usage_logs')
    .upsert(
      {
        workspace_id: workspaceId,
        month,
        messages_sent: 0,
        messages_in: 0,
        campaigns_run: 0,
        contacts_created: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,month', ignoreDuplicates: true }
    );
}

async function incrementColumn(
  db: any,
  workspaceId: string,
  month: string,
  column: keyof Pick<UsageRow, 'messages_sent' | 'messages_in' | 'campaigns_run' | 'contacts_created'>
): Promise<void> {
  await ensureRow(db, workspaceId, month);

  const { data } = await db
    .from('platform_usage_logs')
    .select(column)
    .eq('workspace_id', workspaceId)
    .eq('month', month)
    .single();

  const currentValue: number = (data as any)?.[column] ?? 0;

  await db
    .from('platform_usage_logs')
    .update({
      [column]: currentValue + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('month', month);
}

export async function trackMessageSent(workspaceId: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await incrementColumn(db, workspaceId, currentMonth(), 'messages_sent');
  } catch (err) {
    console.error('[usage-tracker] trackMessageSent failed:', err);
  }
}

export async function trackMessageIn(workspaceId: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await incrementColumn(db, workspaceId, currentMonth(), 'messages_in');
  } catch (err) {
    console.error('[usage-tracker] trackMessageIn failed:', err);
  }
}

export async function trackCampaignRun(workspaceId: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await incrementColumn(db, workspaceId, currentMonth(), 'campaigns_run');
  } catch (err) {
    console.error('[usage-tracker] trackCampaignRun failed:', err);
  }
}

export async function trackContactCreated(workspaceId: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await incrementColumn(db, workspaceId, currentMonth(), 'contacts_created');
  } catch (err) {
    console.error('[usage-tracker] trackContactCreated failed:', err);
  }
}

export async function getUsage(
  workspaceId: string,
  month?: string
): Promise<UsageRow> {
  const targetMonth = month ?? currentMonth();
  const zero: UsageRow = {
    workspace_id: workspaceId,
    month: targetMonth,
    messages_sent: 0,
    messages_in: 0,
    campaigns_run: 0,
    contacts_created: 0,
  };

  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('platform_usage_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('month', targetMonth)
      .single();

    if (error || !data) return zero;

    return {
      workspace_id: data.workspace_id,
      month: data.month,
      messages_sent: data.messages_sent ?? 0,
      messages_in: data.messages_in ?? 0,
      campaigns_run: data.campaigns_run ?? 0,
      contacts_created: data.contacts_created ?? 0,
      updated_at: data.updated_at,
    };
  } catch (err) {
    console.error('[usage-tracker] getUsage failed:', err);
    return zero;
  }
}
