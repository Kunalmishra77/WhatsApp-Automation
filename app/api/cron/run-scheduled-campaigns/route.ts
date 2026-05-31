import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { executeCampaign } from '@/lib/campaign-executor';

export async function GET(request: NextRequest) {
  // Auth: query param ?secret= (for external cron services like cron-job.org)
  // Vercel internal cron calls don't need this (they come from internal network)
  const querySecret = new URL(request.url).searchParams.get('secret');
  const cronSecret  = process.env.CRON_SECRET?.trim();

  // Allow: Vercel internal cron (no secret needed) OR external with correct secret
  const isVercelInternal = request.headers.get('x-vercel-cron') === '1' ||
    request.headers.get('user-agent')?.includes('vercel');
  const hasValidSecret   = cronSecret && querySecret === cronSecret;

  if (!isVercelInternal && !hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const now = new Date().toISOString();

  // Find all campaigns due to run:
  // status = 'scheduled' AND scheduled_at <= now AND scheduled_at > 5 min ago (grace window)
  // Grace window: 24h so daily Vercel cron picks up all missed campaigns
  // External minute-cron: reduces this to ~2 min in practice
  const fiveMinAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: dueCampaigns, error } = await db
    .from('campaigns')
    .select('id, name, workspace_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .gte('scheduled_at', fiveMinAgo);

  if (error) {
    console.error('[Cron] Failed to query scheduled campaigns:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return NextResponse.json({ ran: 0, results: [] });
  }

  console.log(`[Cron] Found ${dueCampaigns.length} campaign(s) to run`);

  const results = await Promise.allSettled(
    dueCampaigns.map((c: { id: string; name: string }) =>
      executeCampaign(c.id).catch((err: unknown) => ({
        campaignId: c.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      })),
    ),
  );

  const summary = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return { campaignId: dueCampaigns[i].id, error: r.reason };
  });

  console.log('[Cron] Campaign run results:', JSON.stringify(summary));

  return NextResponse.json({ ran: dueCampaigns.length, results: summary });
}
