import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  try {
    const { conversationId, content, senderId } = await request.json();

    if (!conversationId || !content?.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // 1. Get conversation + contact + workspace in one query
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select(`
        id, workspace_id,
        contact:contacts(id, phone),
        workspace:workspaces(phone_number_id, access_token)
      `)
      .eq('id', conversationId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const contact   = conv.contact   as { id: string; phone: string } | null;
    const workspace = conv.workspace as { phone_number_id: string; access_token: string } | null;

    if (!contact?.phone || !workspace?.phone_number_id || !workspace?.access_token) {
      return NextResponse.json({ error: 'Missing workspace/contact config' }, { status: 400 });
    }

    // 2. Save message to DB first (optimistic — status: queued)
    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        workspace_id:    conv.workspace_id,
        sender_id:       senderId ?? null,
        sender_type:     'agent',
        direction:       'outbound',
        type:            'text',
        content:         content.trim(),
        status:          'queued',
      })
      .select()
      .single();

    if (msgErr || !msg) {
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    // 3. Send via WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v19.0/${workspace.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${workspace.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                contact.phone,
          type:              'text',
          text: { preview_url: false, body: content.trim() },
        }),
      },
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      // Mark message as failed in DB
      await supabaseAdmin
        .from('messages')
        .update({ status: 'failed' })
        .eq('id', msg.id);

      console.error('[Send] WhatsApp API error:', waData);
      return NextResponse.json(
        { error: waData?.error?.message ?? 'WhatsApp API error', details: waData },
        { status: 502 },
      );
    }

    // 4. Update message with WhatsApp message ID + sent status
    const waMessageId = waData?.messages?.[0]?.id;
    await supabaseAdmin
      .from('messages')
      .update({ status: 'sent', whatsapp_msg_id: waMessageId ?? null })
      .eq('id', msg.id);

    // 5. Update conversation last_message_at
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), last_message: content.trim() })
      .eq('id', conversationId);

    return NextResponse.json({ success: true, messageId: msg.id, waMessageId });

  } catch (err) {
    console.error('[Send] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
