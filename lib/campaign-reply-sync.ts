import { chooseRecipientForReply, type RecipientCandidate } from './campaign-reply-attribution';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Re-derives campaign replies for ONE campaign, correctly and idempotently:
//   • considers each contact's sends across ALL campaigns, so a reply is attributed to the
//     latest send that preceded it — never double-counted across overlapping campaigns;
//   • never attributes a reply that predates the send (chooseRecipientForReply guard);
//   • marks each recipient 'replied' at most once (.neq guard + in-run tracking);
//   • stamps the matched inbound message with campaign_id (campaign-scoped chat view);
//   • recomputes campaigns.replied_count from the canonical status='replied'.
// Used as the backstop by the campaign executor + the hourly cron, and by the one-time
// historical backfill. Returns how many recipients of THIS campaign it newly marked.
export async function backfillCampaignReplies(
  db: any,
  campaignId: string,
  workspaceId: string,
): Promise<number> {
  // Lower bound for the inbound scan = the earliest send in THIS campaign. A reply can
  // never predate its send, so we never look before it. (This replaces the old
  // completed_at − 24h window that reached into the previous day and leaked replies.)
  const { data: firstSend } = await db
    .from('campaign_recipients')
    .select('sent_at')
    .eq('campaign_id', campaignId)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstSend?.sent_at) return 0;
  const campStart = firstSend.sent_at as string;

  // Not-yet-replied recipients of this campaign.
  const pending: Array<{ id: string; phone: string }> = [];
  let offset = 0;
  while (true) {
    const { data: page } = await db
      .from('campaign_recipients')
      .select('id, phone')
      .eq('campaign_id', campaignId)
      .not('status', 'in', '(replied,filtered,failed)')
      .range(offset, offset + 999);
    if (!page?.length) break;
    pending.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  if (!pending.length) return 0;

  let updated = 0;
  const BATCH = 200;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const batchIds = new Set(batch.map((r) => r.id));
    const phones = [...new Set(batch.map((r) => r.phone))];

    const { data: ctcts } = await db
      .from('contacts')
      .select('id, phone')
      .eq('workspace_id', workspaceId)
      .in('phone', phones);
    if (!ctcts?.length) continue;
    const contactIds = ctcts.map((c: any) => c.id);
    const phoneByContact = new Map<string, string>(ctcts.map((c: any) => [c.id, c.phone]));

    const { data: convs } = await db
      .from('conversations')
      .select('id, contact_id')
      .eq('workspace_id', workspaceId)
      .in('contact_id', contactIds);
    if (!convs?.length) continue;
    const convByContact = new Map<string, string>(convs.map((c: any) => [c.contact_id, c.id]));
    const contactByConv = new Map<string, string>(convs.map((c: any) => [c.id, c.contact_id]));
    const convIds = convs.map((c: any) => c.id);

    // Candidate universe: EVERY recipient row (across all campaigns) for these contacts/phones.
    // Two IN queries merged by id — avoids .or() string-injection complexity.
    const candMap = new Map<string, RecipientCandidate>();
    const { data: byContact } = await db
      .from('campaign_recipients')
      .select('id, campaign_id, sent_at, whatsapp_msg_id, status, phone')
      .eq('workspace_id', workspaceId)
      .in('contact_id', contactIds);
    const { data: byPhone } = await db
      .from('campaign_recipients')
      .select('id, campaign_id, sent_at, whatsapp_msg_id, status, phone')
      .eq('workspace_id', workspaceId)
      .in('phone', phones);
    for (const r of [...(byContact ?? []), ...(byPhone ?? [])]) {
      if (!candMap.has(r.id)) candMap.set(r.id, r as RecipientCandidate & { phone: string });
    }
    const candByPhone = new Map<string, Array<RecipientCandidate & { phone: string }>>();
    for (const r of candMap.values()) {
      const p = (r as any).phone as string;
      const arr = candByPhone.get(p) ?? [];
      arr.push(r as RecipientCandidate & { phone: string });
      candByPhone.set(p, arr);
    }

    const { data: msgs } = await db
      .from('messages')
      .select('id, conversation_id, content, type, created_at, metadata')
      .eq('workspace_id', workspaceId)
      .eq('direction', 'inbound')
      .gte('created_at', campStart)
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });
    if (!msgs?.length) continue;

    // Recipients marked replied during THIS run (so the rule treats them as terminal for
    // later inbound messages in the same stream, preserving attribute-once).
    const markedNow = new Set<string>();

    for (const m of msgs) {
      const contactId = contactByConv.get(m.conversation_id);
      if (!contactId) continue;
      const phone = phoneByContact.get(contactId);
      if (!phone) continue;

      const cands = (candByPhone.get(phone) ?? []).map((c) =>
        markedNow.has(c.id) ? { ...c, status: 'replied' } : c,
      );
      const chosen = chooseRecipientForReply(cands, m.created_at as string);
      if (!chosen) continue;
      if (chosen.campaign_id !== campaignId) continue; // this reply belongs to another campaign
      if (!batchIds.has(chosen.id) || markedNow.has(chosen.id)) continue;

      const isBtn = m.type === 'text' && m.metadata?.button_reply;
      const convId = convByContact.get(contactId)!;
      await db
        .from('campaign_recipients')
        .update({
          status: 'replied',
          replied_at: m.created_at,
          reply_type: isBtn ? 'button' : 'text',
          reply_text: (isBtn ? m.metadata.button_reply.text : m.content)?.slice(0, 500) ?? null,
          conversation_id: convId,
        })
        .eq('id', chosen.id)
        .neq('status', 'replied');
      void db
        .from('messages')
        .update({ campaign_id: campaignId })
        .eq('id', m.id)
        .is('campaign_id', null)
        .then(() => {}, () => {});
      markedNow.add(chosen.id);
      updated++;
    }
  }

  if (updated > 0) {
    const { count } = await db
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'replied');
    await db.from('campaigns').update({ replied_count: count ?? 0 }).eq('id', campaignId);
  }
  return updated;
}
