import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { normalizePhone } from '@/lib/phone';
import { extractLeadFields, type AdsColumn } from '@/lib/google-ads-lead-parse';
import { recordTouchpoint } from '@/lib/lead-touchpoint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AdsLeadPayload {
  lead_id?: string;
  user_column_data?: AdsColumn[];
  google_key?: string;
  campaign_id?: string | number;
  form_id?: string | number;
  is_test?: boolean;
  gcl_id?: string;
}

// POST /api/webhooks/google-ads-leads?ws=<workspaceId>
// Receives Google Ads Lead Form submissions. Validated by the per-workspace
// key. Creates a contact + lead on the `google_ads` channel and records a
// touchpoint into the Unified Lead Hub. Fail-open + idempotent per lead_id.
export async function POST(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('ws');
    if (!workspaceId) return NextResponse.json({ error: 'ws required' }, { status: 400 });

    const body = await request.json() as AdsLeadPayload;
    const db = createAdminClient() as any;

    // Validate the shared key against the workspace secret.
    const { data: secret } = await db
      .from('google_ads_lead_secrets')
      .select('webhook_key')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!secret || !body.google_key || body.google_key !== secret.webhook_key) {
      return NextResponse.json({ error: 'invalid key' }, { status: 401 });
    }

    // Google sends test posts when you click "Send test data" — ack without storing.
    if (body.is_test) return NextResponse.json({ status: 'test_ok' });

    const leadId = String(body.lead_id ?? '');

    // Idempotency: skip if we've already recorded this lead_id.
    if (leadId) {
      const { data: dupe } = await db
        .from('marketing_touchpoints')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('ref_type', 'google_lead')
        .eq('ref_id', leadId)
        .maybeSingle();
      if (dupe) return NextResponse.json({ status: 'already_processed' });
    }

    const fields = extractLeadFields(body.user_column_data);
    const phone = fields.phone ? normalizePhone(fields.phone) : (leadId ? `gads:${leadId}` : `gads:${Date.now()}`);
    const displayName = fields.name ?? fields.email ?? 'Google Ads lead';

    // Upsert contact (channel seeded once via recordTouchpoint below).
    const { data: contact } = await db
      .from('contacts')
      .upsert(
        { workspace_id: workspaceId, phone, name: fields.name ?? null, email: fields.email ?? null },
        { onConflict: 'workspace_id,phone', ignoreDuplicates: false },
      )
      .select('id')
      .single();
    if (!contact) return NextResponse.json({ error: 'contact upsert failed' }, { status: 500 });

    // Create the lead.
    const { data: lead } = await db.from('leads').insert({
      workspace_id: workspaceId,
      contact_id: contact.id,
      title: `Lead — ${displayName}`,
      stage: 'new',
      priority: 'medium',
      source: 'google_ads',
      source_detail: body.campaign_id ? `Google Ads campaign ${body.campaign_id}` : 'Google Ads lead form',
      channel: 'google_ads',
      tags: ['google_ads'],
      custom_fields: { google_lead_id: leadId, gcl_id: body.gcl_id ?? null, ...fields.extra },
    }).select('id').single();

    // Attribution touchpoint (also seeds contact channel/first-last touch).
    await recordTouchpoint(db, {
      workspaceId,
      contactId: contact.id as string,
      leadId: lead?.id ?? null,
      channel: 'google_ads',
      sourceDetail: body.campaign_id ? `Google Ads campaign ${body.campaign_id}` : 'Google Ads lead form',
      refType: 'google_lead',
      refId: leadId || null,
      metadata: { form_id: body.form_id ?? null, campaign_id: body.campaign_id ?? null },
    });

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('[GoogleAdsLead webhook]', err);
    // Return 200 so Google does not disable the webhook on transient errors,
    // but log for investigation.
    return NextResponse.json({ status: 'error_logged' });
  }
}
