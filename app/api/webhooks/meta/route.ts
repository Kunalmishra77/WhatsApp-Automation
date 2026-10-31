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

  // Save message.
  //
  // This used to end `.onConflict('whatsapp_msg_id').ignore()`, which is Knex
  // syntax. `db` is a Supabase client — cast to `any`, which is why the
  // compiler never said so — and has no `.onConflict`, so this line threw a
  // TypeError on every message the handler was given. There are zero Instagram
  // or Messenger conversations on the platform, so it has never worked; it
  // would have bitten the day the Instagram add-on was switched on.
  //
  // The intent was "ignore a redelivery". Neither this handler nor the
  // Instagram one has the idempotency layer the WhatsApp webhook uses, so the
  // duplicate is caught here instead: `whatsapp_msg_id` carries a partial
  // unique index, and 23505 means Meta sent this message twice.
  const { error: msgErr } = await db.from('messages').insert({
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
  });

  if (msgErr && msgErr.code !== '23505') {
    // Loud: a message that is not saved is a message the client never sees.
    console.error(`[MetaWebhook] message insert failed for mid ${mid}:`, msgErr.message);
  }

  // No conversation update: the insert above fires
  // `messages_update_conversation`, which sets last_message, last_message_at
  // and unread_count from the row it just saw.
}
