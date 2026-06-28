import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

export const maxDuration = 60;

// Syncs missing campaign replies for campaigns completed in the last 48 hours.
// Catches replies that arrived faster than the campaign_recipients DB flush (race condition).
// Run every hour via Coolify cron: GET /api/cron/sync-campaign-replies
// Auth: Bearer ${CRON_SECRET}
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth   = request.headers.get('authorization');
  const isAdmin = request.nextUrl.searchParams.get('admin') === '1';

  if (secret && auth !== `Bearer ${secret}` && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;

  // Find campaigns completed in the last 48 hours
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: campaigns } = await db
    .from('campaigns')
    .select('id, workspace_id, name, completed_at')
    .eq('status', 'completed')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false });

  if (!campaigns?.length) {
    return NextResponse.json({ synced: 0, message: 'No recent campaigns to sync' });
  }

  let totalSynced = 0;

  for (const camp of campaigns) {
    const campStart = camp.completed_at
      ? new Date(new Date(camp.completed_at).getTime() - 24 * 60 * 60 * 1000).toISOString()
      : since;

    // Get all non-replied recipients for this campaign
    const allNotReplied: Array<{ id: string; phone: string }> = [];
    let offset = 0;
    while (true) {
      const { data: page } = await db
        .from('campaign_recipients')
        .select('id, phone')
        .eq('campaign_id', camp.id)
        .not('status', 'in', '(replied,filtered,failed)')
        .range(offset, offset + 999);
      if (!page?.length) break;
      allNotReplied.push(...page);
      if (page.length < 1000) break;
      offset += 1000;
    }

    if (!allNotReplied.length) continue;

    const BATCH = 200;
    let campSynced = 0;

    for (let i = 0; i < allNotReplied.length; i += BATCH) {
      const batch = allNotReplied.slice(i, i + BATCH);
      const phones = batch.map((r) => r.phone);

      const { data: ctcts } = await db
        .from('contacts')
        .select('id, phone')
        .eq('workspace_id', camp.workspace_id)
        .in('phone', phones);
      if (!ctcts?.length) continue;

      const ctctIds = ctcts.map((c: { id: string }) => c.id);
      const { data: convs } = await db
        .from('conversations')
        .select('id, contact_id')
        .eq('workspace_id', camp.workspace_id)
        .in('contact_id', ctctIds);
      if (!convs?.length) continue;

      const convIds = convs.map((c: { id: string }) => c.id);
      const phoneMap = new Map(ctcts.map((c: { id: string; phone: string }) => [c.id, c.phone]));

      const { data: msgs } = await db
        .from('messages')
        .select('conversation_id, content, type, created_at, metadata')
        .eq('workspace_id', camp.workspace_id)
        .eq('direction', 'inbound')
        .gte('created_at', campStart)
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true });
      if (!msgs?.length) continue;

      // Keep earliest inbound per conversation
      const firstMsgMap = new Map<string, typeof msgs[0]>();
      for (const m of msgs) {
        if (!firstMsgMap.has(m.conversation_id)) firstMsgMap.set(m.conversation_id, m);
      }

      for (const [convId, m] of firstMsgMap) {
        const conv = convs.find((c: { id: string }) => c.id === convId);
        if (!conv) continue;
        const phone = phoneMap.get(conv.contact_id);
        if (!phone) continue;
        const cr = batch.find((r) => r.phone === phone);
        if (!cr) continue;

        const isBtn = m.type === 'text' && m.metadata?.button_reply;
        await db.from('campaign_recipients').update({
          status: 'replied',
          replied_at: m.created_at,
          reply_type: isBtn ? 'button' : 'text',
          reply_text: (isBtn ? m.metadata.button_reply.text : m.content)?.slice(0, 500) ?? null,
          conversation_id: convId,
        }).eq('id', cr.id);

        campSynced++;
      }
    }

    if (campSynced > 0) {
      const { count: repliedCount } = await db
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', camp.id)
        .eq('status', 'replied');
      await db.from('campaigns')
        .update({ replied_count: repliedCount ?? 0 })
        .eq('id', camp.id);
      console.log(`[SyncReplies] Campaign "${camp.name}": +${campSynced} replies linked`);
    }

    totalSynced += campSynced;
  }

  return NextResponse.json({
    success: true,
    campaigns_checked: campaigns.length,
    total_replies_synced: totalSynced,
  });
}
