import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { validateApiKey, apiUnauthorized } from '@/lib/api-auth';
import { checkApiLimit } from '@/lib/rate-limit';

// POST /api/v1/messages — send a WhatsApp text message
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiUnauthorized();

  const rl = await checkApiLimit(auth.keyId);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const { to, message, conversationId } = await request.json() as {
    to?: string;
    message?: string;
    conversationId?: string;
  };

  if (!message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 });
  if (!to && !conversationId) return NextResponse.json({ error: 'to (phone) or conversationId is required' }, { status: 400 });

  const db = createAdminClient() as any;

  // Get workspace credentials
  const { data: ws } = await db
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', auth.workspaceId)
    .single();

  if (!ws?.phone_number_id || !ws?.access_token) {
    return NextResponse.json({ error: 'WhatsApp not configured for this workspace' }, { status: 400 });
  }

  const token = (ws.access_token as string).replace(/﻿/g, '').trim();
  let phone = to?.trim();
  let convId = conversationId;

  // Resolve phone from conversationId if not given
  if (!phone && convId) {
    const { data: conv } = await db
      .from('conversations')
      .select('contact_id, contacts(phone)')
      .eq('id', convId)
      .eq('workspace_id', auth.workspaceId)
      .single();
    phone = (conv?.contacts as { phone?: string } | null)?.phone ?? '';
  }

  if (!phone) return NextResponse.json({ error: 'Could not resolve phone number' }, { status: 400 });

  // Find or create conversation
  if (!convId) {
    // Find contact
    const { data: contact } = await db
      .from('contacts')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('phone', phone)
      .maybeSingle();

    const contactId = contact?.id ?? null;

    if (contactId) {
      const { data: conv } = await db
        .from('conversations')
        .select('id')
        .eq('workspace_id', auth.workspaceId)
        .eq('contact_id', contactId)
        .maybeSingle();
      convId = conv?.id ?? null;
    }
  }

  // Send WhatsApp message
  const waRes = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id as string}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: message.trim() },
    }),
  });

  const waData = await waRes.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!waRes.ok) {
    return NextResponse.json({ error: waData?.error?.message ?? 'WhatsApp send failed' }, { status: waRes.status });
  }

  const waMessageId = waData?.messages?.[0]?.id ?? null;

  // Save to DB if conversation exists
  if (convId) {
    await db.from('messages').insert({
      conversation_id: convId,
      workspace_id:    auth.workspaceId,
      whatsapp_msg_id: waMessageId,
      sender_type:     'bot',
      direction:       'outbound',
      type:            'text',
      content:         message.trim(),
      status:          'sent',
    });
    await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId);
  }

  return NextResponse.json({ success: true, waMessageId, to: phone });
}
