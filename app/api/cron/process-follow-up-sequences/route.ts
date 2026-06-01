import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

interface SequenceStep {
  delay_hours: number;
  message: string;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') ?? '';
  const allowed =
    secret === 'agentix2026cron' ||
    request.headers.get('x-vercel-cron') === '1';

  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const db = admin as any;
  const now = new Date().toISOString();

  // Find all active contact_sequences where next_send_at is due
  const { data: dueSequences, error } = await db
    .from('contact_sequences')
    .select(`
      id,
      workspace_id,
      contact_id,
      sequence_id,
      current_step,
      next_send_at,
      follow_up_sequences (
        name,
        steps,
        is_active
      ),
      contacts (
        phone
      )
    `)
    .eq('status', 'active')
    .lte('next_send_at', now);

  if (error) {
    console.error('[FollowUpCron] Failed to query sequences:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueSequences || dueSequences.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  console.log(`[FollowUpCron] Processing ${dueSequences.length} due sequence step(s)`);

  let processed = 0;
  let failed = 0;

  for (const cs of dueSequences) {
    try {
      const seq = cs.follow_up_sequences as { name?: string; steps?: SequenceStep[]; is_active?: boolean } | null;
      if (!seq?.is_active) {
        await db
          .from('contact_sequences')
          .update({ status: 'cancelled' })
          .eq('id', cs.id);
        continue;
      }

      const steps: SequenceStep[] = Array.isArray(seq.steps) ? seq.steps as SequenceStep[] : [];
      const currentStep = cs.current_step as number;

      if (currentStep >= steps.length) {
        // All steps done
        await db
          .from('contact_sequences')
          .update({ status: 'completed' })
          .eq('id', cs.id);
        continue;
      }

      const step = steps[currentStep];
      const contactPhone = (cs.contacts as { phone?: string } | null)?.phone;

      if (!contactPhone || !step?.message) {
        await db
          .from('contact_sequences')
          .update({ status: 'cancelled' })
          .eq('id', cs.id);
        continue;
      }

      // Fetch workspace credentials
      const { data: ws } = await db
        .from('workspaces')
        .select('phone_number_id, access_token')
        .eq('id', cs.workspace_id)
        .single();

      if (!ws?.phone_number_id || !ws?.access_token) continue;

      const token = (ws.access_token as string).replace(/﻿/g, '').trim();

      // Send WhatsApp message
      const waRes = await fetch(
        `https://graph.facebook.com/v19.0/${ws.phone_number_id as string}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: contactPhone,
            type: 'text',
            text: { preview_url: false, body: step.message },
          }),
        },
      );

      if (!waRes.ok) {
        const errBody = await waRes.text();
        console.error(`[FollowUpCron] WhatsApp send failed for contact_sequence ${cs.id as string}:`, errBody);
        failed++;
        continue;
      }

      // Advance to next step
      const nextStep = currentStep + 1;
      const isDone = nextStep >= steps.length;
      const nextStep_ = steps[nextStep];
      const nextSendAt = isDone || !nextStep_
        ? null
        : new Date(Date.now() + nextStep_.delay_hours * 60 * 60 * 1000).toISOString();

      await db
        .from('contact_sequences')
        .update({
          current_step: nextStep,
          next_send_at: nextSendAt,
          status: isDone ? 'completed' : 'active',
        })
        .eq('id', cs.id);

      processed++;
    } catch (err) {
      console.error(`[FollowUpCron] Error processing cs ${cs.id as string}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ processed, failed });
}
