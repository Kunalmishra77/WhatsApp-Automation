import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Supabase admin client (service role — bypasses RLS for webhook inserts)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Meta webhook verification (GET) ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === (process.env.WHATSAPP_WEBHOOK_SECRET ?? '').trim()) {
    console.log('[Webhook] Verified by Meta');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ── Meta signature verification ──────────────────────────────────────────────
function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.META_APP_SECRET!;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Incoming message handler (POST) ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  const rawBody  = await request.text();
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

  // Process each entry/change asynchronously (don't block Meta's 20s timeout)
  void processPayload(payload);

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

// ── Payload processing ────────────────────────────────────────────────────────
async function processPayload(payload: WhatsAppPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      // Handle incoming messages
      for (const msg of value.messages ?? []) {
        await handleIncomingMessage(msg, value.metadata, value.contacts ?? []);
      }

      // Handle status updates (delivered, read, failed)
      for (const status of value.statuses ?? []) {
        await handleStatusUpdate(status);
      }
    }
  }
}

// ── Handle incoming customer message ─────────────────────────────────────────
async function handleIncomingMessage(
  msg: WAMessage,
  metadata: WAMetadata,
  contacts: WAContact[],
) {
  const waId       = msg.from;  // customer's WhatsApp number
  const wabaId     = metadata.phone_number_id;
  const contactInfo = contacts.find((c) => c.wa_id === waId);
  const customerName = contactInfo?.profile?.name ?? waId;

  // 1. Find workspace by phone_number_id
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('phone_number_id', wabaId)
    .single();

  if (!workspace) {
    console.error('[Webhook] No workspace for phone_number_id:', wabaId);
    return;
  }

  const workspaceId = workspace.id;

  // 2. Upsert contact (unique on workspace_id, phone)
  const { data: contact } = await supabase
    .from('contacts')
    .upsert(
      {
        workspace_id: workspaceId,
        phone:        waId,
        name:         customerName,
      },
      { onConflict: 'workspace_id,phone', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (!contact) return;

  // 3. Upsert conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id:   contact.id,
        status:       'open',
        channel:      'whatsapp',
        last_message_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,contact_id', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (!conversation) return;

  // 4. Insert message
  const content = extractMessageContent(msg);
  const msgType = [
    'text','image','video','audio','document','location','sticker','interactive','template','internal_note'
  ].includes(msg.type) ? msg.type : 'text';

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    workspace_id:    workspaceId,
    whatsapp_msg_id: msg.id,
    sender_type:     'contact',
    sender_id:       contact.id,
    direction:       'inbound',
    type:            msgType,
    content,
    status:          'delivered',
    created_at:      new Date(parseInt(msg.timestamp) * 1000).toISOString(),
  });

  // 5. Update conversation: last_message_at + last_message text + increment unread_count
  await supabase.rpc('increment_unread', { conv_id: conversation.id, msg_content: content });

  // 6. Send auto-reply with customer message for AI context
  await sendAutoReply(waId, customerName, workspaceId, content);

  console.log(`[Webhook] Message from ${waId}: ${content}`);
}

// ── Gemini AI reply generator ─────────────────────────────────────────────────
async function getGeminiReply(customerMessage: string, customerName: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const name = customerName || 'there';
  const systemPrompt = `You are a helpful customer support assistant for V4TOU Tech, a company that provides:
- Business Automation (smart workflows, WhatsApp automation)
- Website Development (modern, fast websites)
- Tech Solutions (end-to-end technical support)

Your name is "V4TOU Assistant". Reply in the same language the customer uses (Hindi or English).
Be friendly, professional, and concise (max 3-4 sentences).
Always end with encouraging them to share more details about their requirement.
Customer name: ${name}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey as string}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: `Hello! I'm V4TOU Assistant, happy to help you.` }] },
            { role: 'user', parts: [{ text: customerMessage }] },
          ],
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
      }
    );
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (err) {
    console.error('[Gemini] Error:', err);
    return null;
  }
}

// ── Auto-reply (Gemini AI + fallback static) ──────────────────────────────────
async function sendAutoReply(toPhone: string, customerName: string, workspaceId: string, customerMessage = '') {
  const { data: ws } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (!ws?.phone_number_id || !ws?.access_token) return;

  const name = customerName !== toPhone ? (customerName.split(' ')[0] ?? customerName) : 'there';

  // Try Gemini AI first, fallback to static reply
  let message = await getGeminiReply(customerMessage, name);

  if (!message) {
    message =
      `Hello ${name}! 👋\n\n` +
      `Welcome to *V4TOU Tech* 🚀\n\n` +
      `We specialize in:\n` +
      `✅ *Automation* — Smart business workflows\n` +
      `✅ *Website Development* — Modern, fast websites\n` +
      `✅ *Tech Solutions* — End-to-end tech support\n\n` +
      `Our team has received your message and will get back to you *shortly*.\n\n` +
      `_V4TOU Tech — Powering your digital future_ 💡`;
  }

  try {
    await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                toPhone,
        type:              'text',
        text: { preview_url: false, body: message },
      }),
    });
    console.log(`[AutoReply] Sent to ${toPhone}`);
  } catch (err) {
    console.error('[AutoReply] Failed:', err);
  }
}

// ── Handle delivery/read status update ───────────────────────────────────────
async function handleStatusUpdate(status: WAStatus) {
  const validStatuses = ['sent', 'delivered', 'read', 'failed'];
  if (!validStatuses.includes(status.status)) return;

  await supabase
    .from('messages')
    .update({ status: status.status })
    .eq('whatsapp_msg_id', status.id);
}

// ── Extract text content from any message type ────────────────────────────────
function extractMessageContent(msg: WAMessage): string {
  switch (msg.type) {
    case 'text':     return msg.text?.body ?? '';
    case 'image':    return msg.image?.caption ?? '[Image]';
    case 'video':    return msg.video?.caption ?? '[Video]';
    case 'audio':    return '[Audio]';
    case 'document': return msg.document?.filename ?? '[Document]';
    case 'location': return `[Location: ${msg.location?.latitude},${msg.location?.longitude}]`;
    case 'sticker':  return '[Sticker]';
    default:         return `[${msg.type}]`;
  }
}

// ── TypeScript types ──────────────────────────────────────────────────────────
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
