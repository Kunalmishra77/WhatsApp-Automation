// Meta Webhook handler for Instagram DM and Facebook Messenger
// WhatsApp is handled separately at /api/webhooks/whatsapp
// Both Instagram and Messenger use the same Messenger Platform webhook format

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { getRequiredSecret } from '@/lib/supabase-env';

type AdminClient = ReturnType<typeof createAdminClient>;

interface MetaMessaging {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid:         string;
    text?:       string;
    attachments?: Array<{ type: string; payload: { url?: string } }>;
  };
  read?:     { watermark: number };
  delivery?: { watermark: number };
}

// Webhook verification (same token as WhatsApp)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === getRequiredSecret('WHATSAPP_WEBHOOK_SECRET')) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  let payload: { object: string; entry: Array<{ id: string; messaging?: MetaMessaging[] }> };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channel = payload.object === 'instagram' ? 'instagram' : 'messenger';
  const db = createAdminClient() as any;

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id; // Page or Instagram account ID

    for (const messaging of entry.messaging ?? []) {
      if (!messaging.message?.text || messaging.message.text === '') continue;

      const senderId   = messaging.sender.id;
      const messageText = messaging.message.text;
      const mid         = messaging.message.mid;

      await handleMetaMessage(db, {
        channel,
        pageId,
        senderId,
        messageText,
        mid,
        timestamp: messaging.timestamp,
        attachments: messaging.message.attachments,
      });
    }
  }

  return NextResponse.json({ status: 'ok' });
}

async function handleMetaMessage(
  db: any,
  params: {
    channel: 'instagram' | 'messenger';
    pageId: string;
    senderId: string;
    messageText: string;
    mid: string;
    timestamp: number;
    attachments?: Array<{ type: string; payload: { url?: string } }>;
  },
) {
  const { channel, pageId, senderId, messageText, mid, timestamp, attachments } = params;

  // Find workspace by page ID (stored in workspaces.settings.meta_page_id)
  const { data: workspaces } = await db
    .from('workspaces')
    .select('id, settings, phone_number_id, access_token');

  const workspace = (workspaces ?? []).find((ws: any) =>
    ws.settings?.meta_page_id === pageId || ws.settings?.[`${channel}_page_id`] === pageId,
  );

  if (!workspace) {
    console.log(`[MetaWebhook] No workspace for pageId ${pageId} on ${channel}`);
    return;
  }

  const workspaceId = workspace.id;

  // Upsert contact (using senderId as phone equivalent)
  await db.from('contacts').upsert(
    { workspace_id: workspaceId, phone: `${channel}_${senderId}`, name: `${channel.charAt(0).toUpperCase() + channel.slice(1)} User ${senderId.slice(-6)}` },
    { onConflict: 'workspace_id,phone', ignoreDuplicates: true },
  );

  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('phone', `${channel}_${senderId}`)
    .single();

  if (!contact) return;

  // Upsert conversation
  await db.from('conversations').upsert(
    { workspace_id: workspaceId, contact_id: contact.id, status: 'open', channel, last_message_at: new Date(timestamp * 1000).toISOString() },
    { onConflict: 'workspace_id,contact_id', ignoreDuplicates: false },
  );

  const { data: conversation } = await db
    .from('conversations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contact.id)
    .single();

  if (!conversation) return;

  // Determine message type
  const attachment = attachments?.[0];
  const msgType = attachment
    ? (['image', 'video', 'audio', 'file'].includes(attachment.type) ? attachment.type : 'text')
    : 'text';

  // Save message
  await db.from('messages').insert({
    conversation_id: conversation.id,
    workspace_id:    workspaceId,
    sender_type:     'contact',
    sender_id:       contact.id,
    direction:       'inbound',
    type:            msgType,
    content:         messageText,
    media_url:       attachment?.payload?.url ?? null,
    whatsapp_msg_id: mid,
    status:          'delivered',
    created_at:      new Date(timestamp * 1000).toISOString(),
  }).onConflict('whatsapp_msg_id').ignore();

  // Update conversation last message
  await db.from('conversations').update({
    last_message:    messageText,
    last_message_at: new Date(timestamp * 1000).toISOString(),
  }).eq('id', conversation.id);
}
