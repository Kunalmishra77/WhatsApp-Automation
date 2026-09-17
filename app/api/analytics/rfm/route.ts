import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import {
  segmentFromScores, recencyScore, frequencyScore, monetaryScore,
  SEGMENT_LABELS, SEGMENT_TIP, type RfmSegment,
} from '@/lib/rfm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ContactAgg { lastAt: number; count: number; monetary: number; name: string | null }

// GET /api/analytics/rfm?workspaceId=
// Segments customers by Recency / Frequency / Monetary from their orders.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // Aggregate orders per contact (paginated).
    const byContact = new Map<string, ContactAgg>();
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db
        .from('orders')
        .select('contact_id, customer_name, total_amount, created_at')
        .eq('workspace_id', workspaceId)
        .not('contact_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) return NextResponse.json({ error: 'Failed to read orders' }, { status: 500 });
      const rows = (data ?? []) as Array<{ contact_id: string; customer_name: string | null; total_amount: number | null; created_at: string }>;
      for (const o of rows) {
        const agg = byContact.get(o.contact_id) ?? { lastAt: 0, count: 0, monetary: 0, name: null };
        const t = Date.parse(o.created_at);
        if (!Number.isNaN(t) && t > agg.lastAt) agg.lastAt = t;
        agg.count += 1;
        agg.monetary += Number(o.total_amount ?? 0);
        if (!agg.name && o.customer_name) agg.name = o.customer_name;
        byContact.set(o.contact_id, agg);
      }
      if (rows.length < PAGE) break;
    }

    const contacts = [...byContact.entries()];
    if (contacts.length === 0) {
      return NextResponse.json({ segments: [], totals: { customers: 0, value: 0 } });
    }

    // Monetary tertile thresholds across customers.
    const monetaryValues = contacts.map(([, a]) => a.monetary).sort((x, y) => x - y);
    const t1 = monetaryValues[Math.floor(monetaryValues.length / 3)] ?? 0;
    const t2 = monetaryValues[Math.floor((2 * monetaryValues.length) / 3)] ?? 0;

    const now = Date.now();
    const buckets = new Map<RfmSegment, { count: number; value: number; sample: Array<{ id: string; name: string | null }> }>();
    for (const [contactId, a] of contacts) {
      const days = a.lastAt ? Math.floor((now - a.lastAt) / 86_400_000) : 9999;
      const seg = segmentFromScores(recencyScore(days), frequencyScore(a.count), monetaryScore(a.monetary, t1, t2));
      const b = buckets.get(seg) ?? { count: 0, value: 0, sample: [] };
      b.count += 1;
      b.value += a.monetary;
      if (b.sample.length < 8) b.sample.push({ id: contactId, name: a.name });
      buckets.set(seg, b);
    }

    const order: RfmSegment[] = ['champions', 'loyal', 'big_spenders', 'promising', 'new', 'at_risk', 'needs_attention', 'lost'];
    const segments = order
      .filter((s) => buckets.has(s))
      .map((s) => ({
        segment: s,
        label: SEGMENT_LABELS[s],
        tip: SEGMENT_TIP[s],
        count: buckets.get(s)!.count,
        value: Math.round(buckets.get(s)!.value),
        contacts: buckets.get(s)!.sample,
      }));

    const totals = {
      customers: contacts.length,
      value: Math.round(contacts.reduce((sum, [, a]) => sum + a.monetary, 0)),
    };

    return NextResponse.json({ segments, totals });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[rfm]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
