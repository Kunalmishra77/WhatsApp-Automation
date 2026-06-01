import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const status      = request.nextUrl.searchParams.get('status'); // filter
    const page        = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
    const limit       = 50;
    const offset      = (page - 1) * limit;

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // Campaign summary
    const { data: campaign } = await db
      .from('campaigns')
      .select('id, name, status, total_recipients, sent_count, failed_count, delivered_count, read_count, started_at, completed_at, media_id, media_type, templates(name)')
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    // Recipient stats
    const { data: statsRaw } = await db
      .from('campaign_recipients')
      .select('status')
      .eq('campaign_id', campaignId);

    const stats = { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 };
    for (const r of (statsRaw ?? [])) {
      stats.total++;
      const s = r.status as string;
      if (s === 'sent')      stats.sent++;
      if (s === 'delivered') stats.delivered++;
      if (s === 'read')      stats.read++;
      if (s === 'failed')    stats.failed++;
      if (s === 'replied')   stats.replied++;
    }

    // Recipients list (paginated, optionally filtered)
    let query = db
      .from('campaign_recipients')
      .select('id, phone, name, status, sent_at, delivered_at, read_at, replied_at, error_message, conversation_id', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') query = query.eq('status', status);

    const { data: recipients, count } = await query;

    return NextResponse.json({
      campaign,
      stats,
      recipients: recipients ?? [],
      total: count ?? 0,
      page,
      pages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Recipients]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
