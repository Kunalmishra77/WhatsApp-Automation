import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { executeCampaign } from '@/lib/campaign-executor';

export async function GET(request: NextRequest) {
  const url        = new URL(request.url);
  const secret     = url.searchParams.get('secret') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const allowed    = !!cronSecret && secret === cronSecret;
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const now = new Date().toISOString();

  // Campaigns due to run: status='scheduled', scheduled_at <= now, scheduled_at > 20min ago.
  // 20-minute grace window covers the 15-minute cron interval plus drift.
  // Campaigns won't double-run because executeCampaign checks for 'running'/'completed' status.
  const fiveMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

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

  // ─── Process follow-up sequences ────────────────────────────────────
  let sequencesProcessed = 0;
  try {
    const { data: dueSeqs } = await db
      .from('contact_sequences')
      .select('*, follow_up_sequences(steps, workspace_id, name)')
      .eq('status', 'active')
      .lte('next_send_at', now);

    if (dueSeqs && dueSeqs.length > 0) {
      console.log(`[Cron] Found ${dueSeqs.length} follow-up sequence step(s) to send`);

      for (const seq of dueSeqs as Array<{
        id: string;
        sequence_id: string;
        workspace_id: string;
        contact_id: string;
        current_step: number;
        follow_up_sequences: { steps: Array<{ delay_hours: number; message: string }>; workspace_id: string; name: string } | null;
      }>) {
        try {
          const steps = seq.follow_up_sequences?.steps ?? [];
          const step = steps[seq.current_step];
          if (!step) {
            await db.from('contact_sequences').update({ status: 'completed' }).eq('id', seq.id);
            continue;
          }

          // Get contact phone
          const { data: contact } = await db
            .from('contacts')
            .select('phone')
            .eq('id', seq.contact_id)
            .single();

          if (!contact?.phone) {
            console.warn(`[Cron] Sequence ${seq.id}: contact ${seq.contact_id} has no phone`);
            await db.from('contact_sequences').update({ status: 'failed' }).eq('id', seq.id);
            continue;
          }

          // Get workspace credentials
          const { data: ws } = await db
            .from('workspaces')
            .select('phone_number_id, access_token')
            .eq('id', seq.workspace_id)
            .single();

          if (!ws?.phone_number_id || !ws?.access_token) {
            console.warn(`[Cron] Sequence ${seq.id}: workspace ${seq.workspace_id} missing credentials`);
            continue;
          }

          // Send WhatsApp message
          const waRes = await fetch(
            `https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: contact.phone,
                type: 'text',
                text: { preview_url: false, body: step.message },
              }),
            },
          );

          if (!waRes.ok) {
            const errData = await waRes.json();
            console.error(`[Cron] Sequence ${seq.id} WA send failed:`, errData);
          }

          // Advance to next step or complete
          const nextStep = seq.current_step + 1;
          if (nextStep >= steps.length) {
            await db.from('contact_sequences').update({ status: 'completed', current_step: nextStep }).eq('id', seq.id);
          } else {
            const nextStepObj = steps[nextStep];
            const nextDelayMs = (nextStepObj?.delay_hours ?? 24) * 60 * 60 * 1000;
            const nextSendAt = new Date(Date.now() + nextDelayMs).toISOString();
            await db.from('contact_sequences')
              .update({ current_step: nextStep, next_send_at: nextSendAt })
              .eq('id', seq.id);
          }

          sequencesProcessed++;
        } catch (seqErr) {
          console.error(`[Cron] Error processing sequence enrollment ${seq.id}:`, seqErr);
        }
      }
    }
  } catch (seqListErr) {
    console.error('[Cron] Error querying due sequences:', seqListErr);
  }

  // ─── Mark undelivered contacts as Failed (24h timeout) ─────────────────────
  // WhatsApp messages that were accepted by the API but never delivered after 24h
  // are treated as failed — so clients can export and re-run for these contacts.
  let expiredMarked = 0;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find campaigns that have undelivered 'sent' rows older than 24h
    const { data: expiredRows } = await db
      .from('campaign_recipients')
      .select('id, campaign_id')
      .eq('status', 'sent')
      .lt('sent_at', cutoff)
      .limit(2000);

    if (expiredRows && expiredRows.length > 0) {
      const ids = (expiredRows as Array<{ id: string; campaign_id: string }>).map((r) => r.id);

      // Bulk update to failed
      const { error: updateErr } = await db
        .from('campaign_recipients')
        .update({
          status:        'failed',
          error_message: 'Message not delivered by WhatsApp (24h timeout)',
        })
        .in('id', ids);

      if (!updateErr) {
        expiredMarked = ids.length;

        // Update campaigns table counts for each affected campaign
        const affectedCampaignIds = [...new Set(
          (expiredRows as Array<{ campaign_id: string }>).map((r) => r.campaign_id),
        )];

        for (const cid of affectedCampaignIds) {
          const [sentRes, deliveredRes, readRes, failedRes] = await Promise.all([
            db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).neq('status', 'failed'),
            db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).in('status', ['delivered', 'read', 'replied']),
            db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).in('status', ['read', 'replied']),
            db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).eq('status', 'failed'),
          ]);
          await db.from('campaigns').update({
            sent_count:      sentRes.count      ?? 0,
            delivered_count: deliveredRes.count ?? 0,
            read_count:      readRes.count      ?? 0,
            failed_count:    failedRes.count    ?? 0,
          }).eq('id', cid);
        }

        console.log(`[Cron] Marked ${expiredMarked} undelivered contacts as failed across ${affectedCampaignIds.length} campaign(s)`);
      }
    }
  } catch (expiredErr) {
    console.error('[Cron] Error marking expired sent as failed:', expiredErr);
  }

  return NextResponse.json({ ran: dueCampaigns.length, results: summary, sequencesProcessed, expiredMarked });
}
