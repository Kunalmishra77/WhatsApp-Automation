import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_RECIPIENTS = 100;

// POST /api/gbp/request-review
// Body: { workspaceId, mode?: 'customers'|'ids', contactIds?: string[],
//         templateName?, languageCode? }
// Sends the approved review-request WhatsApp template to happy customers (those
// with orders) or to an explicit set of contacts, with a link to leave a Google
// review (the link lives in the template's URL button). Human-triggered.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      mode?: 'customers' | 'ids';
      contactIds?: string[];
      templateName?: string;
      languageCode?: string;
    };
    const workspaceId = body.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const templateName = (body.templateName ?? 'review_request').trim();
    const languageCode = (body.languageCode ?? 'en').trim();

    // WhatsApp creds + business name.
    const { data: ws } = await db
      .from('workspaces')
      .select('name, phone_number_id, access_token')
      .eq('id', workspaceId)
      .single();
    if (!ws?.phone_number_id || !ws.access_token) {
      return NextResponse.json({ error: 'Workspace WhatsApp is not configured' }, { status: 400 });
    }
    const businessName = ws.name ?? 'our business';

    // Resolve recipients.
    let contactIds = body.contactIds ?? [];
    if ((body.mode ?? 'customers') === 'customers' && contactIds.length === 0) {
      // Happy customers = distinct contacts with at least one order (last 180 days).
      const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
      const { data: orders } = await db
        .from('orders')
        .select('contact_id')
        .eq('workspace_id', workspaceId)
        .not('contact_id', 'is', null)
        .gte('created_at', since)
        .limit(5000);
      const orderRows = (orders ?? []) as Array<{ contact_id: string }>;
      contactIds = [...new Set(orderRows.map((o) => o.contact_id))];
    }
    if (contactIds.length === 0) {
      return NextResponse.json({ error: 'No customers to message', sent: 0 }, { status: 200 });
    }
    contactIds = contactIds.slice(0, MAX_RECIPIENTS);

    // Load contact names + phones.
    const { data: contacts } = await db
      .from('contacts')
      .select('id, name, phone, is_blocked, opted_out')
      .eq('workspace_id', workspaceId)
      .in('id', contactIds);

    const token = ws.access_token.replace(/﻿/g, '').trim();
    let sent = 0, failed = 0, skipped = 0;

    for (const c of (contacts ?? []) as Array<{ id: string; name: string | null; phone: string; is_blocked: boolean; opted_out: boolean }>) {
      if (c.is_blocked || c.opted_out || !c.phone || c.phone.startsWith('ig:')) { skipped++; continue; }
      const firstName = (c.name ?? 'there').split(' ')[0];
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: c.phone,
            type: 'template',
            template: {
              name: templateName,
              language: { code: languageCode },
              components: [
                { type: 'body', parameters: [
                  { type: 'text', text: firstName },
                  { type: 'text', text: businessName },
                ] },
              ],
            },
          }),
        });
        if (res.ok) sent++; else { failed++; if (failed <= 2) console.error('[request-review] send failed:', await res.text()); }
      } catch (e) {
        failed++;
        console.error('[request-review] error:', e);
      }
    }

    return NextResponse.json({ sent, failed, skipped, audience: contactIds.length });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[request-review]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
