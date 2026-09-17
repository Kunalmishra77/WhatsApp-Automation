import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/referrals?workspaceId=
// Referral leaderboard (top referrers) + recent referrals + totals.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('referrals')
      .select('id, referrer_contact_id, referred_name, referred_phone, status, reward_amount, created_at, referrer:contacts!referrals_referrer_contact_id_fkey(name, phone)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      // Fallback without the FK embed if the relationship name differs.
      const { data: plain } = await db.from('referrals')
        .select('id, referrer_contact_id, referred_name, referred_phone, status, created_at')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(500);
      return NextResponse.json({ ...summarise(plain ?? [], null), recent: (plain ?? []).slice(0, 50) });
    }

    const rows = (data ?? []) as Array<any>;
    const nameByReferrer = new Map<string, string>();
    for (const r of rows) {
      if (r.referrer_contact_id && r.referrer?.name && !nameByReferrer.has(r.referrer_contact_id)) {
        nameByReferrer.set(r.referrer_contact_id, r.referrer.name);
      }
    }
    return NextResponse.json({ ...summarise(rows, nameByReferrer), recent: rows.slice(0, 50) });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[referrals]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function summarise(rows: Array<any>, names: Map<string, string> | null) {
  const byReferrer = new Map<string, { name: string; total: number; converted: number }>();
  let converted = 0;
  for (const r of rows) {
    if (r.status === 'converted' || r.status === 'rewarded') converted++;
    const key = r.referrer_contact_id ?? 'unknown';
    const e = byReferrer.get(key) ?? { name: names?.get(key) ?? r.referrer?.name ?? 'Customer', total: 0, converted: 0 };
    e.total += 1;
    if (r.status === 'converted' || r.status === 'rewarded') e.converted += 1;
    byReferrer.set(key, e);
  }
  const leaderboard = [...byReferrer.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
  return {
    totals: { referrals: rows.length, converted, referrers: byReferrer.size },
    leaderboard,
  };
}
