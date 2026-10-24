import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { assessBotHealth, type BotHealthRow } from '@/lib/bot-health';

export const runtime = 'nodejs';

// GET /api/admin/bot-health?days=7
//
// Per-client bot quality. Built after the scope guardrail spent six weeks
// refusing real customers with nothing in the product to show it — the regression
// was visible in the messages table the whole time and nobody was looking.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = Number(request.nextUrl.searchParams.get('days') ?? 7);
  const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.trunc(raw))) : 7;

  const { data, error } = await db.rpc('admin_bot_health', { p_days: days });
  if (error) {
    console.error('[AdminBotHealth]', error);
    return NextResponse.json({ error: 'Failed to load bot health' }, { status: 500 });
  }

  const rows = ((data ?? []) as BotHealthRow[]).map((r) => {
    // Postgres bigint arrives as a string over PostgREST; everything downstream
    // does arithmetic on these.
    const n: BotHealthRow = {
      ...r,
      inbound:          Number(r.inbound),
      bot_replies:      Number(r.bot_replies),
      refusals:         Number(r.refusals),
      refused_contacts: Number(r.refused_contacts),
      fallbacks:        Number(r.fallbacks),
      median_reply_sec: r.median_reply_sec === null ? null : Number(r.median_reply_sec),
    };
    return { ...n, verdict: assessBotHealth(n, days) };
  });

  return NextResponse.json({
    days,
    rows,
    summary: {
      clients:      rows.length,
      needsAttention: rows.filter((r) => r.verdict.worst !== 'ok').length,
      refusals:     rows.reduce((a, r) => a + r.refusals, 0),
      refusedPeople: rows.reduce((a, r) => a + r.refused_contacts, 0),
      fallbacks:    rows.reduce((a, r) => a + r.fallbacks, 0),
    },
  });
}
