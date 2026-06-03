import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/campaigns/[id]/ab-comparison
// Returns side-by-side stats for A/B variants.
// Works whether [id] is the parent OR either variant.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const db = createAdminClient() as any;

    // Fetch the requested campaign
    const { data: baseCampaign } = await db
      .from('campaigns')
      .select('id, workspace_id, name, ab_test_group, parent_campaign_id, status, total_recipients, sent_count, failed_count, completed_at, created_at, templates(name, body)')
      .eq('id', campaignId)
      .single();

    if (!baseCampaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    await requireWorkspacePermission(baseCampaign.workspace_id, 'view_analytics');

    // Resolve root — if this is a child, go up to the parent
    const rootId: string = baseCampaign.parent_campaign_id ?? baseCampaign.id;

    // Fetch all campaigns in this A/B group (parent + children, or children only if parent)
    const { data: variants } = await db
      .from('campaigns')
      .select('id, name, ab_test_group, status, total_recipients, sent_count, failed_count, completed_at, created_at, templates(name, body)')
      .or(`id.eq.${rootId},parent_campaign_id.eq.${rootId}`)
      .order('ab_test_group', { ascending: true });

    if (!variants || variants.length < 2) {
      return NextResponse.json({ error: 'Not an A/B campaign or variants not found' }, { status: 404 });
    }

    // For each variant, pull recipient-level stats
    const enriched = await Promise.all(
      (variants as Array<{
        id: string; name: string; ab_test_group: string | null; status: string;
        total_recipients: number | null; sent_count: number | null; failed_count: number | null;
        completed_at: string | null; created_at: string;
        templates: { name: string; body: string } | null;
      }>).map(async (v) => {
        const { data: recipientStats } = await db
          .from('campaign_recipients')
          .select('status')
          .eq('campaign_id', v.id);

        const stats = (recipientStats ?? []) as Array<{ status: string }>;
        const total     = stats.length;
        const delivered = stats.filter((r) => ['delivered', 'read', 'replied'].includes(r.status)).length;
        const read      = stats.filter((r) => ['read', 'replied'].includes(r.status)).length;
        const replied   = stats.filter((r) => r.status === 'replied').length;
        const failed    = stats.filter((r) => r.status === 'failed').length;

        return {
          id:          v.id,
          name:        v.name,
          group:       v.ab_test_group ?? '?',
          status:      v.status,
          template:    v.templates?.name ?? '—',
          created_at:  v.created_at,
          completed_at: v.completed_at,
          stats: {
            total,
            delivered,
            read,
            replied,
            failed,
            delivery_rate: total > 0 ? Math.round((delivered / total) * 100) : 0,
            read_rate:     total > 0 ? Math.round((read / total) * 100) : 0,
            reply_rate:    total > 0 ? Math.round((replied / total) * 100) : 0,
          },
        };
      }),
    );

    // Determine winner by reply rate, fallback to read rate
    const sorted = [...enriched].sort((a, b) =>
      b.stats.reply_rate - a.stats.reply_rate ||
      b.stats.read_rate  - a.stats.read_rate,
    );
    const top = sorted[0];
    const winner = top && (top.stats.reply_rate > 0 || top.stats.read_rate > 0)
      ? top.id
      : null;

    return NextResponse.json({ variants: enriched, winner });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AB Comparison]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
