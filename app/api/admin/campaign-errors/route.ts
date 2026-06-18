import { NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/admin/campaign-errors?name=PB_VMS_3_B
// Returns error distribution for a campaign by name. DELETE THIS FILE after use.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name') ?? 'PB_VMS_3_B';
  const db = createAdminClient() as any;

  const { data: campaign } = await db
    .from('campaigns')
    .select('id, name, status, sent_count, failed_count, total_recipients')
    .ilike('name', name)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Get distinct errors with counts
  const { data: errors } = await db
    .from('campaign_recipients')
    .select('error_message, status')
    .eq('campaign_id', campaign.id)
    .eq('status', 'failed')
    .limit(500);

  const errorCounts: Record<string, number> = {};
  for (const row of errors ?? []) {
    const msg = row.error_message ?? 'unknown';
    errorCounts[msg] = (errorCounts[msg] ?? 0) + 1;
  }

  const sorted = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([error, count]) => ({ count, error }));

  return NextResponse.json({
    campaign: campaign.name,
    status:   campaign.status,
    total:    campaign.total_recipients,
    sent:     campaign.sent_count,
    failed:   campaign.failed_count,
    top_errors: sorted,
  });
}
