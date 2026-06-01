import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { executeCampaign } from '@/lib/campaign-executor';

export async function GET(request: NextRequest) {
  // Simple secret check — URL must contain ?secret=agentix2026cron
  // OR request comes from Vercel internal cron (x-vercel-cron header)
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') ?? '';
  const allowed = secret === 'agentix2026cron' ||
    request.headers.get('x-vercel-cron') === '1';

  if (!allowed) {
    console.log('[Cron] Rejected — secret:', JSON.stringify(secret));
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

  return NextResponse.json({ ran: dueCampaigns.length, results: summary, sequencesProcessed });
}
