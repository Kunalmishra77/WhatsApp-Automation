import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { sendWeeklyDigest } from '@/lib/weekly-digest';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/cron/weekly-digest — email a weekly performance summary to every
// active workspace's admins. Bearer CRON_SECRET guarded.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const { data: workspaces } = await db
    .from('workspaces')
    .select('id, name')
    .eq('is_active', true);

  let sent = 0, skipped = 0, failed = 0;
  for (const ws of (workspaces ?? []) as Array<{ id: string; name: string | null }>) {
    const r = await sendWeeklyDigest(db, ws);
    if (r.skipped) skipped++;
    else if (r.sent > 0) sent++;
    else failed++;
  }
  return NextResponse.json({ workspaces: (workspaces ?? []).length, sent, skipped, failed });
}
