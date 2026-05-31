import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';
import { getRequiredSecret } from '@/lib/supabase-env';

type AdminClient = ReturnType<typeof createAdminClient>;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === getRequiredSecret('WHATSAPP_WEBHOOK_SECRET')) {
    console.log('[Webhook] Verified by Meta');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function verifySignature(body: string, signature: string): boolean {
  const cleanSignature = signature.trim();
  if (!cleanSignature.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', getRequiredSecret('META_APP_SECRET'))
    .update(body, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';

  if (!verifySignature(rawBody, signature)) {
    console.error('[Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const eventId = await recordWebhookEvent(supabase, payload, signature);

  try {
    await markWebhookEvent(supabase, eventId, 'processing');
    const result = await processPayload(supabase, payload);
    await markWebhookEvent(supabase, eventId, 'processed');

    return NextResponse.json({ status: 'ok', eventId, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
    await markWebhookEvent(supabase, eventId, 'failed', message);
    console.error('[Webhook] Processing failed:', message);

    return NextResponse.json({ error: 'Webhook processing failed', eventId }, { status: 500 });
  }
}

async function recordWebhookEvent(
  supabase: AdminClient,
  payload: WhatsAppPayload,
  signature: string,
): Promise<string> {
  const metaMessageIds = extractMetaMessageIds(payload);
  const { data, error } = await (supabase as any)
    .from('whatsapp_webhook_events')
    .insert({
      payload,
      signature,
      meta_message_ids: metaMessageIds,
      status: 'received',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to persist webhook event');
  }

  return data.id as string;
}

async function markWebhookEvent(
  supabase: AdminClient,
  eventId: string,
  status: 'processing' | 'processed' | 'failed',
  error?: string,
) {
  const patch: Record<string, unknown> = {
    status,
    attempts: status === 'processing' ? undefined : undefined,
    last_error: error ?? null,
    processed_at: status === 'processed' ? new Date().toISOString() : null,
  };

  delete patch.attempts;

  const { error: updateError } = await (supabase as any)
    .from('whatsapp_webhook_events')
    .update(patch)
    .eq('id', eventId);

  if (updateError) {
    console.error('[Webhook] Failed to update event status:', updateError.message);
  }
}

function extractMetaMessageIds(payload: WhatsAppPayload): string[] {
  const ids = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value.messages ?? []) ids.add(msg.id);
      for (const status of change.value.statuses ?? []) ids.add(status.id);
    }
  }
  return [...ids];
}

async function processPayload(supabase: AdminClient, payload: WhatsAppPayload) {
  let messagesProcessed = 0;
  let statusesProcessed = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      for (const msg of value.messages ?? []) {
        await handleIncomingMessage(supabase, msg, value.metadata, value.contacts ?? []);
        messagesProcessed += 1;
      }

      for (const status of value.statuses ?? []) {
        await handleStatusUpdate(supabase, status);
        statusesProcessed += 1;
      }
    }
  }

  return { messagesProcessed, statusesProcessed };
}

async function handleIncomingMessage(
  supabase: AdminClient,
  msg: WAMessage,
  metadata: WAMetadata,
  contacts: WAContact[],
) {
  const waId = msg.from;
  const phoneNumberId = metadata.phone_number_id;
  const contactInfo = contacts.find((c) => c.wa_id === waId);
  const customerName = contactInfo?.profile?.name ?? waId;

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('phone_number_id', phoneNumberId)
    .single();

  if (workspaceError || !workspace) {
    throw new Error(`No workspace for phone_number_id ${phoneNumberId}`);
  }

  const workspaceId = workspace.id;

  const hasRealName = !!contactInfo?.profile?.name;

  let contactId: string;
  if (hasRealName) {
    // We have the WhatsApp display name — full merge upsert
    const { data, error } = await (supabase as any)
      .from('contacts')
      .upsert(
        { workspace_id: workspaceId, phone: waId, name: customerName },
        { onConflict: 'workspace_id,phone', ignoreDuplicates: false },
      )
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Failed to upsert contact');
    contactId = data.id as string;
  } else {
    // No profile name from WhatsApp — insert if new, never overwrite an existing name
    await (supabase as any)
      .from('contacts')
      .upsert(
        { workspace_id: workspaceId, phone: waId },
        { onConflict: 'workspace_id,phone', ignoreDuplicates: true },
      );
    const { data: existing, error } = await (supabase as any)
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('phone', waId)
      .single();
    if (error || !existing) throw new Error(error?.message ?? 'Failed to find contact');
    contactId = existing.id as string;
  }

  const contact = { id: contactId };

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id: contact.id,
        status: 'open',
        channel: 'whatsapp',
        last_message_at: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
      },
      { onConflict: 'workspace_id,contact_id', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? 'Failed to upsert WhatsApp conversation');
  }

  const content = extractMessageContent(msg);
  const messageType = toMessageType(msg.type);
  const createdAt = new Date(parseInt(msg.timestamp, 10) * 1000).toISOString();

  const { error: messageError } = await (supabase as any).from('messages').insert({
    conversation_id: conversation.id,
    workspace_id: workspaceId,
    whatsapp_msg_id: msg.id,
    sender_type: 'contact',
    sender_id: contact.id,
    direction: 'inbound',
    type: messageType,
    content,
    status: 'delivered',
    media_filename: msg.document?.filename ?? null,
    caption: msg.image?.caption ?? msg.video?.caption ?? null,
    metadata: {
      whatsapp: msg,
      display_phone_number: metadata.display_phone_number,
    } as Record<string, unknown>,
    created_at: createdAt,
  });

  if (messageError?.code === '23505') {
    console.log(`[Webhook] Duplicate message ignored: ${msg.id}`);
    return;
  }

  if (messageError) {
    throw new Error(messageError.message);
  }

  await sendAutoReply(supabase, waId, customerName, workspaceId, content, conversation.id, contact.id);
  console.log(`[Webhook] Message from ${waId}: ${content}`);
}

async function getAIReply(customerMessage: string, customerName: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.replace(/\uFEFF/g, '').trim();
  const model  = process.env.AI_MODEL?.trim() ?? 'openai/gpt-oss-120b:free';

  if (!apiKey) {
    console.warn('[AI] OPENROUTER_API_KEY not set \u2014 using fallback reply');
    return null;
  }

  const systemPrompt = `You are a helpful customer support assistant for V4TOU Tech.
Reply in the same language the customer uses (Hindi, English, etc.).
Be friendly, professional, and concise \u2014 max 3 sentences.
Customer name: ${customerName}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whatsapp-automation-kohl-six.vercel.app',
        'X-Title': 'Agentix',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: customerMessage },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[AI] OpenRouter error ${res.status}:`, errBody);
      return null;
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply = data?.choices?.[0]?.message?.content?.trim() ?? null;
    if (!reply) console.warn('[AI] Empty response from OpenRouter');
    return reply;
  } catch (error) {
    console.error('[AI] Network/parse error:', error);
    return null;
  }
}

async function sendAutoReply(
  supabase: AdminClient,
  toPhone: string,
  customerName: string,
  workspaceId: string,
  customerMessage = '',
  conversationId?: string,
  contactId?: string,
) {
  const { data: ws } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (!ws?.phone_number_id || !ws?.access_token) return;

  const name = customerName !== toPhone ? (customerName.split(' ')[0] ?? customerName) : 'there';
  const message = await getAIReply(customerMessage, name)
    ?? `Hello ${name}, thanks for reaching out to V4TOU Tech. Our team received your message and will get back to you shortly.`;

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/\uFEFF/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: message },
      }),
    });

    if (!response.ok) {
      console.error('[AutoReply] WhatsApp API error:', await response.text());
      return;
    }

    const waData = await response.json() as { messages?: Array<{ id?: string }> };
    const waMessageId = waData?.messages?.[0]?.id ?? null;
    console.log(`[AutoReply] Sent to ${toPhone}`);

    // Save bot reply to DB so dashboard shows it
    if (conversationId && contactId) {
      const now = new Date().toISOString();
      await (supabase as any).from('messages').insert({
        conversation_id: conversationId,
        workspace_id:    workspaceId,
        sender_type:     'bot',
        sender_id:       null,
        direction:       'outbound',
        type:            'text',
        content:         message,
        status:          'sent',
        whatsapp_msg_id: waMessageId,
        created_at:      now,
      });

      await (supabase as any).from('conversations').update({
        last_message:    message,
        last_message_at: now,
      }).eq('id', conversationId);
    }
  } catch (error) {
    console.error('[AutoReply] Failed:', error);
  }
}

async function handleStatusUpdate(supabase: AdminClient, status: WAStatus) {
  const validStatuses = ['sent', 'delivered', 'read', 'failed'] as const;
  if (!validStatuses.includes(status.status as (typeof validStatuses)[number])) return;

  const patch: Record<string, string> = { status: status.status };
  if (status.status === 'delivered') patch.delivered_at = new Date(parseInt(status.timestamp, 10) * 1000).toISOString();
  if (status.status === 'read') patch.read_at = new Date(parseInt(status.timestamp, 10) * 1000).toISOString();

  const { error } = await (supabase as any)
    .from('messages')
    .update(patch)
    .eq('whatsapp_msg_id', status.id);

  if (error) throw new Error(error.message);
}

function toMessageType(type: string) {
  const allowed = [
    'text',
    'image',
    'video',
    'audio',
    'document',
    'location',
    'sticker',
    'interactive',
    'template',
    'internal_note',
  ] as const;

  return allowed.includes(type as (typeof allowed)[number]) ? type : 'text';
}

function extractMessageContent(msg: WAMessage): string {
  switch (msg.type) {
    case 'text': return msg.text?.body ?? '';
    case 'image': return msg.image?.caption ?? '[Image]';
    case 'video': return msg.video?.caption ?? '[Video]';
    case 'audio': return '[Audio]';
    case 'document': return msg.document?.filename ?? '[Document]';
    case 'location': return `[Location: ${msg.location?.latitude},${msg.location?.longitude}]`;
    case 'sticker': return '[Sticker]';
    default: return `[${msg.type}]`;
  }
}

interface WhatsAppPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: WAValue;
    }>;
  }>;
}

interface WAValue {
  messaging_product: string;
  metadata: WAMetadata;
  contacts?: WAContact[];
  messages?: WAMessage[];
  statuses?: WAStatus[];
}

interface WAMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

interface WAContact {
  wa_id: string;
  profile?: { name: string };
}

interface WAMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string; id: string };
  video?: { caption?: string; id: string };
  audio?: { id: string };
  document?: { filename?: string; id: string };
  location?: { latitude: number; longitude: number };
  sticker?: { id: string };
}

interface WAStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}
