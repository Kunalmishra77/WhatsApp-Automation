import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { syncWorkspaceSpend } from '@/lib/meta-spend-sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = createAdminClient() as any;
  const { data: workspaces } = await db
    .from('workspaces')
    .select('id, waba_id, access_token')
    .not('waba_id', 'is', null)
    .not('access_token', 'is', null)
    .eq('is_active', true);

  let synced = 0, failed = 0;
  for (const ws of (workspaces ?? [])) {
    const r = await syncWorkspaceSpend(db, ws);
    if (r.error) failed++; else synced++;
  }
  return NextResponse.json({ workspaces: (workspaces ?? []).length, synced, failed });
}
