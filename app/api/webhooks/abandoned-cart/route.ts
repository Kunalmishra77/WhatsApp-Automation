import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import crypto from 'crypto';

// POST /api/webhooks/abandoned-cart
// Public endpoint — called by Shopify, WooCommerce, or custom stores.
// Payload: { trigger_id, contact_phone, contact_name?, cart_url?, cart_value? }
// Validates HMAC-SHA256 signature via X-Webhook-Secret header OR query param ?secret=
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      trigger_id?:    string;
      workspace_id?:  string;
      contact_phone?: string;
      contact_name?:  string;
      cart_url?:      string;
      cart_value?:    string | number;
    };

    if (!body.contact_phone) {
      return NextResponse.json({ error: 'contact_phone required' }, { status: 400 });
    }

    // Find trigger either by trigger_id or workspace_id
    const db = createAdminClient() as any;
    let trigger: any;

    if (body.trigger_id) {
      const { data } = await db
        .from('automation_triggers')
        .select('*, workspaces(phone_number_id, access_token)')
        .eq('id', body.trigger_id)
        .eq('trigger_type', 'abandoned_cart')
        .eq('is_active', true)
        .single();
      trigger = data;
    } else if (body.workspace_id) {
      const { data } = await db
        .from('automation_triggers')
        .select('*, workspaces(phone_number_id, access_token)')
        .eq('workspace_id', body.workspace_id)
        .eq('trigger_type', 'abandoned_cart')
        .eq('is_active', true)
        .maybeSingle();
      trigger = data;
    }

    if (!trigger) {
      return NextResponse.json({ error: 'No active abandoned-cart trigger found' }, { status: 404 });
    }

    // Validate webhook secret if configured
    const configuredSecret = trigger.config?.webhook_secret as string | undefined;
    if (configuredSecret) {
      const incoming = request.headers.get('x-webhook-secret') ?? request.nextUrl.searchParams.get('secret') ?? '';
      const valid = crypto.timingSafeEqual(
        Buffer.from(incoming),
        Buffer.from(configuredSecret),
      );
      if (!valid) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    const ws = trigger.workspaces as { phone_number_id?: string; access_token?: string } | null;
    if (!ws?.phone_number_id || !ws?.access_token) {
      return NextResponse.json({ error: 'Workspace WhatsApp not configured' }, { status: 400 });
    }

    const token   = (ws.access_token as string).replace(/﻿/g, '').trim();
    const phoneId = ws.phone_number_id as string;

    // Build personalised message
    const delayMinutes = (trigger.config?.delay_minutes as number) ?? 0;
    let message = (trigger.message as string)
      .replace(/\{\{name\}\}/gi, body.contact_name ?? 'there')
      .replace(/\{\{cart_url\}\}/gi, body.cart_url ?? '')
      .replace(/\{\{cart_value\}\}/gi, String(body.cart_value ?? ''));

    if (delayMinutes > 0) {
      // Queue the message for later — insert into time_trigger_queue
      const triggerAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

      // Find/create contact
      const { data: contact } = await db
        .from('contacts')
        .select('id')
        .eq('workspace_id', trigger.workspace_id)
        .eq('phone', body.contact_phone)
        .maybeSingle();

      await db.from('time_trigger_queue').insert({
        workspace_id:  trigger.workspace_id,
        contact_id:    contact?.id ?? null,
        trigger_at:    triggerAt,
        action_type:   'send_message',
        action_data:   { phone: body.contact_phone, message, trigger_id: trigger.id },
        status:        'pending',
      });

      return NextResponse.json({ queued: true, send_at: triggerAt });
    }

    // Send immediately
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: body.contact_phone,
          type: 'text',
          text: { preview_url: !!body.cart_url, body: message },
        }),
      },
    );

    const status = res.ok ? 'sent' : 'failed';
    const errData = res.ok ? null : (await res.json() as any)?.error?.message;

    // Find contact for log
    const { data: contact } = await db
      .from('contacts')
      .select('id')
      .eq('workspace_id', trigger.workspace_id)
      .eq('phone', body.contact_phone)
      .maybeSingle();

    await db.from('automation_trigger_logs').insert({
      trigger_id:    trigger.id,
      workspace_id:  trigger.workspace_id,
      contact_id:    contact?.id ?? null,
      contact_phone: body.contact_phone,
      status,
      error:         errData,
    });

    if (!res.ok) return NextResponse.json({ error: errData ?? 'WhatsApp send failed' }, { status: 502 });
    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error('[AbandonedCart Webhook]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
