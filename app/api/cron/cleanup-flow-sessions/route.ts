import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/cron/cleanup-flow-sessions
// Marks flow_sessions that have been "active" for > 48 hours as "expired"
// Prevents stuck sessions from blocking new flows for a contact
export async function GET(request: NextRequest) {
  const secret     = request.nextUrl.searchParams.get('secret') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createAdminClient() as any;
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hrs ago

    const { data, error } = await db
      .from('flow_sessions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('updated_at', cutoff)
      .select('id');

    if (error) {
      console.error('[CleanupFlowSessions] DB error:', error);
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
    }

    const expired = (data as Array<{ id: string }> | null)?.length ?? 0;
    console.log(`[CleanupFlowSessions] Expired ${expired} stale sessions`);

    return NextResponse.json({ success: true, expired });
  } catch (err) {
    console.error('[CleanupFlowSessions] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
