import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';
import { getRequiredSecret } from '@/lib/supabase-env';
import { applyInboxRules } from '@/lib/inbox-rules-engine';
import { processFlowForMessage } from '@/lib/flow-engine';
import { dispatchWebhookEvent } from '@/lib/outbound-webhook';
import { checkAutoReplyLimit } from '@/lib/rate-limit';
import { isWithinBusinessHours, type BusinessHoursConfig } from '@/app/api/business-hours/route';

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

  // ── Non-blocking language detection for contact ────────────────────────────
  if (content && content.length > 5) {
    const _contactId = contactId;
    detectLanguage(content).then(async (lang) => {
      if (!lang || lang === 'en') return;
      await (supabase as any)
        .from('contacts')
        .update({ language: lang })
        .eq('id', _contactId);
    }).catch(() => {});
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Opt-out / Opt-in detection ─────────────────────────────────────────────
  const optResult = await handleOptInOut(supabase, contact.id, workspaceId, waId, content);
  if (optResult === 'out' || optResult === 'in') {
    console.log(`[Webhook] Contact ${waId} opted ${optResult}`);
    return;
  }

  // Block opted-out contacts from receiving AI replies
  if (optResult === 'blocked') {
    console.log(`[Webhook] Skipping opted-out contact ${waId}`);
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Order status detection ──────────────────────────────────────────────────
  const orderHandled = await checkAndHandleOrderQuery(supabase, waId, workspaceId, content);
  if (orderHandled) {
    console.log(`[Webhook] Order status query handled for ${waId}`);
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── CSAT reply detection (before rules/flow/AI) ─────────────────────────────
  const csatHandled = await checkAndHandleCsatReply(
    supabase,
    conversation.id,
    workspaceId,
    waId,
    content,
  );
  if (csatHandled) {
    console.log(`[Webhook] CSAT reply handled for conversation ${conversation.id}`);
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Campaign reply detection ─────────────────────────────────────────────────
  {
    const { data: pendingCr } = await (supabase as any)
      .from('campaign_recipients')
      .select('id')
      .eq('contact_id', contactId)
      .not('status', 'in', '("failed","replied")')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingCr) {
      await (supabase as any)
        .from('campaign_recipients')
        .update({ status: 'replied', replied_at: new Date().toISOString() })
        .eq('id', pendingCr.id);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Count inbound messages in this conversation (including the one just inserted)
  // If count is exactly 1, this is the first inbound message.
  const { count: msgCount } = await (supabase as any)
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound');

  const isFirstMessage = (msgCount ?? 0) <= 1;

  // ── Outbound webhooks (fire-and-forget) ────────────────────────────────────
  void dispatchWebhookEvent(workspaceId, 'message.received', {
    message_id: msg.id,
    conversation_id: conversation.id,
    contact_id: contact.id,
    contact_phone: waId,
    contact_name: customerName,
    content,
    direction: 'inbound',
  });
  if (isFirstMessage) {
    void dispatchWebhookEvent(workspaceId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contact.id,
      contact_phone: waId,
      contact_name: customerName,
    });
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Fetch workspace credentials for any auto_reply actions in rules
  const { data: wsForRules } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (wsForRules?.phone_number_id && wsForRules?.access_token) {
    await applyInboxRules(
      supabase,
      workspaceId,
      content,
      conversation.id,
      contact.id,
      isFirstMessage,
      wsForRules.phone_number_id,
      wsForRules.access_token,
    );

    // Try flow engine — if a flow handles this message, skip AI auto-reply
    const flowHandled = await processFlowForMessage(
      supabase,
      workspaceId,
      conversation.id,
      contactId,
      content,
      wsForRules.phone_number_id,
      wsForRules.access_token,
      waId,
    );

    if (flowHandled) {
      console.log(`[Webhook] Flow handled message for conversation ${conversation.id}`);
      return;
    }
  }

  // ── Non-blocking auto-categorization (after message saved) ─────────────────
  const supabaseForCat = supabase;
  const convIdForCat = conversation.id;
  categorizeMessage(content).then(async (label) => {
    if (!label) return;
    const { data: conv } = await (supabaseForCat as any)
      .from('conversations')
      .select('labels')
      .eq('id', convIdForCat)
      .single();
    const existing: string[] = conv?.labels ?? [];
    if (!existing.includes(label)) {
      await (supabaseForCat as any)
        .from('conversations')
        .update({ labels: [...existing, label] })
        .eq('id', convIdForCat);
    }
  }).catch(() => {}); // silent fail
  // ─────────────────────────────────────────────────────────────────────────────

  // Escalation detection — check BEFORE calling AI auto-reply
  const keywordEscalation = checkEscalationKeywords(content);
  let isEscalation = keywordEscalation;

  if (keywordEscalation) {
    // Update conversation status to pending (needs human agent)
    await (supabase as any)
      .from('conversations')
      .update({ status: 'pending' })
      .eq('id', conversation.id);

    console.log(`[Webhook] Keyword escalation detected for conversation ${conversation.id}`);
  } else if (content.length > 20) {
    // AI sentiment escalation with 3-second timeout
    const aiEscalation = await Promise.race([
      detectNegativeSentiment(content),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);

    if (aiEscalation) {
      isEscalation = true;
      await (supabase as any)
        .from('conversations')
        .update({ status: 'pending' })
        .eq('id', conversation.id);

      console.log(`[Webhook] AI sentiment escalation detected for conversation ${conversation.id}`);
    }
  }

  // Business hours check
  const { data: bhConfig } = await (supabase as any)
    .from('business_hours')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (bhConfig?.is_enabled && !isWithinBusinessHours(bhConfig as BusinessHoursConfig)) {
    // Outside business hours — send away message and skip AI
    const { data: ws } = await supabase.from('workspaces').select('phone_number_id, access_token').eq('id', workspaceId).single();
    if (ws?.phone_number_id && ws?.access_token) {
      const token = (ws.access_token as string).replace(/﻿/g, '').trim();
      await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: waId,
          type: 'text', text: { preview_url: false, body: bhConfig.away_message },
        }),
      }).catch(() => {});
    }
    console.log(`[AutoReply] Outside business hours — sent away message to ${waId}`);
    return;
  }

  // Rate limit: max 1 auto-reply per 30s per contact
  const canReply = await checkAutoReplyLimit(contact.id);
  if (canReply) {
    // Build rich AI prompt for media messages so AI can reply contextually
    const aiPrompt = buildAiPrompt(msg, content);
    await sendAutoReply(supabase, waId, customerName, workspaceId, aiPrompt, conversation.id, contact.id, isEscalation);
  } else {
    console.log(`[AutoReply] Rate limited for contact ${contact.id} — skipping`);
  }
  console.log(`[Webhook] Message from ${waId}: ${content}`);
}

const ESCALATION_KEYWORDS = [
  'human', 'agent', 'real person', 'help me', 'speak to', 'talk to',
  'complaint', 'refund', 'cancel', 'fraud', 'cheated',
];

function checkEscalationKeywords(message: string): boolean {
  const lower = message.toLowerCase();
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw));
}

async function detectNegativeSentiment(message: string): Promise<boolean> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return false;

  try {
    const timeoutSignal = AbortSignal.timeout(3000);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: timeoutSignal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whatsapp-automation-kohl-six.vercel.app',
        'X-Title': 'Agentix',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free',
        messages: [
          {
            role: 'system',
            content:
              'Analyze if this customer message shows strong negative sentiment, frustration, anger, or urgent need for human help. Reply with ONLY "true" or "false".',
          },
          { role: 'user', content: message },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    if (!res.ok) return false;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data?.choices?.[0]?.message?.content?.toLowerCase().trim();
    return answer === 'true';
  } catch {
    return false;
  }
}

async function detectLanguage(content: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

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
        model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free',
        messages: [
          {
            role: 'system',
            content:
              'Detect the language of the given text. Reply with ONLY the ISO 639-1 code (e.g. "en", "hi", "es", "ar", "fr"). No explanation.',
          },
          { role: 'user', content: content.slice(0, 200) },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const lang = data?.choices?.[0]?.message?.content?.toLowerCase().trim();
    return /^[a-z]{2,3}$/.test(lang ?? '') ? lang! : null;
  } catch {
    return null;
  }
}

async function categorizeMessage(content: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || content.length < 10) return null;

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
        model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free',
        messages: [
          {
            role: 'system',
            content:
              'Categorize this customer message into exactly ONE of these labels: billing, support, sales, complaint, inquiry, spam, general. Reply with ONLY the label word.',
          },
          { role: 'user', content },
        ],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const label = data?.choices?.[0]?.message?.content?.toLowerCase().trim();
    const validLabels = ['billing', 'support', 'sales', 'complaint', 'inquiry', 'spam', 'general'];
    return validLabels.includes(label ?? '') ? label! : null;
  } catch {
    return null;
  }
}

async function fetchKnowledgeBaseContext(
  supabase: AdminClient,
  workspaceId: string,
  query: string,
): Promise<string> {
  try {
    const { data: entries } = await (supabase as any)
      .from('knowledge_base')
      .select('title, content, tags, priority')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .eq('is_draft', false)
      .order('priority', { ascending: false })
      .limit(20);

    if (!entries || entries.length === 0) return '';

    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    const scored = (entries as Array<{ title: string; content: string; tags?: string[]; priority?: number }>).map((e) => {
      const titleLower = e.title.toLowerCase();
      const contentLower = e.content.toLowerCase();
      const tagsText = (e.tags ?? []).join(' ').toLowerCase();

      let score = (e.priority ?? 0) * 0.1; // base priority weight
      for (const w of queryWords) {
        if (titleLower.includes(w)) score += 3;       // title match = strongest
        else if (tagsText.includes(w)) score += 2;    // tag match = strong
        else if (contentLower.includes(w)) score += 1; // content match = weaker
      }
      return { title: e.title, content: e.content, score };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter((e) => e.score > 0 || entries.length <= 5)
      .map((e) => `## ${e.title}\n${e.content}`)
      .join('\n\n');

    return top;
  } catch {
    return '';
  }
}

async function getAIReply(customerMessage: string, customerName: string, kbContext = ''): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.replace(/\uFEFF/g, '').trim();
  const model  = process.env.AI_MODEL?.trim() ?? 'openai/gpt-oss-120b:free';

  if (!apiKey) {
    console.warn('[AI] OPENROUTER_API_KEY not set \u2014 using fallback reply');
    return null;
  }

  const kbSection = kbContext
    ? `\n\nKNOWLEDGE BASE \u2014 use this to answer accurately:\n${kbContext}\n\nIf the answer is in the knowledge base, use it. If not, give a helpful general response.`
    : '';

  const systemPrompt = `You are a helpful customer support assistant for V4TOU Tech.
Reply in the same language the customer uses (Hindi, English, etc.).
Be friendly, professional, and concise \u2014 max 3 sentences.
Customer name: ${customerName}${kbSection}`;

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

// Builds a rich prompt for AI so it can reply contextually to any media type
function buildAiPrompt(msg: WAMessage, textContent: string): string {
  switch (msg.type) {
    case 'image': {
      const caption = msg.image?.caption;
      return caption
        ? `User sent an image with caption: "${caption}". Acknowledge the image and respond helpfully to the caption.`
        : 'User sent an image. Acknowledge it warmly and ask how you can help.';
    }
    case 'video': {
      const caption = msg.video?.caption;
      return caption
        ? `User sent a video with caption: "${caption}". Acknowledge the video and respond to the caption.`
        : 'User sent a video. Acknowledge it and ask what they need help with.';
    }
    case 'audio':
      return 'User sent a voice message. Let them know you received it and politely ask them to type their query so you can assist them better.';
    case 'document': {
      const filename = msg.document?.filename ?? 'a document';
      return `User sent a document: "${filename}". Acknowledge receipt and ask how you can help them with it.`;
    }
    case 'location':
      return 'User shared their location. Acknowledge it and ask how you can assist them.';
    case 'sticker':
      return 'User sent a sticker. Reply in a friendly, warm way and ask how you can help.';
    default:
      return textContent;
  }
}

const ESCALATION_REPLY =
  "I understand you need assistance. Let me connect you with one of our agents right away. Please hold on.";

async function sendAutoReply(
  supabase: AdminClient,
  toPhone: string,
  customerName: string,
  workspaceId: string,
  customerMessage = '',
  conversationId?: string,
  contactId?: string,
  isEscalation = false,
) {
  const { data: ws } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (!ws?.phone_number_id || !ws?.access_token) return;

  const name = customerName !== toPhone ? (customerName.split(' ')[0] ?? customerName) : 'there';

  // Fetch active KB entries for this workspace to inject as context
  const kbContext = await fetchKnowledgeBaseContext(supabase, workspaceId, customerMessage);

  const message = isEscalation
    ? ESCALATION_REPLY
    : (await getAIReply(customerMessage, name, kbContext)
      ?? `Hello ${name}, thanks for reaching out to V4TOU Tech. Our team received your message and will get back to you shortly.`);

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

// Regex to detect order reference in a message (e.g. "order 12345", "#ORD-001", "order no. ABC")
const ORDER_PATTERN = /(?:order|ord(?:er)?\s*(?:no\.?|#|id)?)\s*[:#]?\s*([A-Za-z0-9_-]{3,30})/i;

const STOP_WORDS  = ['stop', 'unsubscribe', 'cancel', 'quit', 'opt out', 'optout', 'remove me', 'end'];
const START_WORDS = ['start', 'subscribe', 'yes', 'opt in', 'optin', 'resume'];

async function handleOptInOut(
  supabase: AdminClient,
  contactId: string,
  workspaceId: string,
  phone: string,
  content: string,
): Promise<'out' | 'in' | 'blocked' | null> {
  const lower = content.trim().toLowerCase();
  const db = supabase as any;

  const isStop  = STOP_WORDS.some((w) => lower === w || lower === w + '!');
  const isStart = START_WORDS.some((w) => lower === w || lower === w + '!');

  if (isStop) {
    await db.from('contacts').update({ opted_out: true }).eq('id', contactId);

    const { data: ws } = await supabase.from('workspaces').select('phone_number_id, access_token').eq('id', workspaceId).single();
    if (ws?.phone_number_id && ws?.access_token) {
      await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: phone,
          type: 'text', text: { preview_url: false, body: 'You have been unsubscribed. You will no longer receive automated messages from us. Reply START to re-subscribe.' },
        }),
      }).catch(() => {});
    }
    return 'out';
  }

  if (isStart) {
    await db.from('contacts').update({ opted_out: false }).eq('id', contactId);

    const { data: ws } = await supabase.from('workspaces').select('phone_number_id, access_token').eq('id', workspaceId).single();
    if (ws?.phone_number_id && ws?.access_token) {
      await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: phone,
          type: 'text', text: { preview_url: false, body: 'Welcome back! You have been re-subscribed to our messages. 😊' },
        }),
      }).catch(() => {});
    }
    return 'in';
  }

  // Check if contact is already opted out
  const { data: contact } = await db.from('contacts').select('opted_out').eq('id', contactId).single();
  if (contact?.opted_out) return 'blocked';

  return null;
}

async function checkAndHandleOrderQuery(
  supabase: AdminClient,
  contactPhone: string,
  workspaceId: string,
  content: string,
): Promise<boolean> {
  if (!content) return false;

  const match = ORDER_PATTERN.exec(content);
  if (!match) return false;

  const orderRef = match[1];
  const db = supabase as any;

  const { data: order } = await db
    .from('orders')
    .select('order_ref, status, items_summary, expected_at, notes')
    .eq('workspace_id', workspaceId)
    .eq('order_ref', orderRef)
    .maybeSingle();

  if (!order) return false; // Order not found — let normal AI flow handle it

  const statusEmoji: Record<string, string> = {
    pending:          '⏳',
    confirmed:        '✅',
    processing:       '🔄',
    shipped:          '📦',
    out_for_delivery: '🚚',
    delivered:        '✅',
    cancelled:        '❌',
    refunded:         '💰',
  };

  const emoji = statusEmoji[order.status as string] ?? '📋';
  const expectedLine = order.expected_at
    ? `\nExpected: ${new Date(order.expected_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';
  const notesLine = order.notes ? `\n${order.notes as string}` : '';

  const replyText =
    `${emoji} Order Update for #${orderRef}\n` +
    `Status: ${(order.status as string).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}` +
    expectedLine + notesLine;

  const { data: ws } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (!ws?.phone_number_id || !ws?.access_token) return false;

  try {
    await fetch(
      `https://graph.facebook.com/v19.0/${ws.phone_number_id as string}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: contactPhone,
          type: 'text',
          text: { preview_url: false, body: replyText },
        }),
      },
    );
  } catch (err) {
    console.error('[OrderBot] Failed to send reply:', err);
    return false;
  }

  return true;
}

async function checkAndHandleCsatReply(
  supabase: AdminClient,
  conversationId: string,
  workspaceId: string,
  contactPhone: string,
  content: string,
): Promise<boolean> {
  const trimmed = content.trim();
  const score = parseInt(trimmed, 10);
  if (isNaN(score) || score < 1 || score > 5 || trimmed.length !== 1) return false;

  // Check for pending CSAT record for this conversation
  const db = supabase as any;
  const { data: pending } = await db
    .from('csat_responses')
    .select('id')
    .eq('conversation_id', conversationId)
    .is('score', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return false;

  // Update score
  await db
    .from('csat_responses')
    .update({ score, responded_at: new Date().toISOString() })
    .eq('id', pending.id);

  // Send thank-you
  const { data: ws } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (ws?.phone_number_id && ws?.access_token) {
    try {
      await fetch(
        `https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: contactPhone,
            type: 'text',
            text: { preview_url: false, body: 'Thank you for your feedback! ⭐ We appreciate it.' },
          }),
        },
      );
    } catch (err) {
      console.error('[CSAT] Failed to send thank-you:', err);
    }
  }

  return true;
}

async function handleStatusUpdate(supabase: AdminClient, status: WAStatus) {
  const validStatuses = ['sent', 'delivered', 'read', 'failed'] as const;
  if (!validStatuses.includes(status.status as (typeof validStatuses)[number])) return;

  const patch: Record<string, string> = { status: status.status };
  if (status.status === 'delivered') patch.delivered_at = new Date(parseInt(status.timestamp, 10) * 1000).toISOString();
  if (status.status === 'read') patch.read_at = new Date(parseInt(status.timestamp, 10) * 1000).toISOString();

  const db = supabase as any;

  const { error } = await db
    .from('messages')
    .update(patch)
    .eq('whatsapp_msg_id', status.id);

  if (error) throw new Error(error.message);

  // Mirror status to campaign_recipients and sync aggregate counts on campaigns table
  const { data: updatedCr } = await db
    .from('campaign_recipients')
    .update(patch)
    .eq('whatsapp_msg_id', status.id)
    .select('campaign_id')
    .maybeSingle();

  if (updatedCr?.campaign_id && (status.status === 'delivered' || status.status === 'read')) {
    // Re-aggregate from campaign_recipients (accurate regardless of order of events)
    const { data: rows } = await db
      .from('campaign_recipients')
      .select('status')
      .eq('campaign_id', updatedCr.campaign_id);

    const allRows = (rows ?? []) as Array<{ status: string }>;
    // delivered_count = everyone who got at least delivered (delivered + read + replied)
    const deliveredCount = allRows.filter((r) => ['delivered', 'read', 'replied'].includes(r.status)).length;
    const readCount      = allRows.filter((r) => ['read', 'replied'].includes(r.status)).length;

    await db
      .from('campaigns')
      .update({ delivered_count: deliveredCount, read_count: readCount })
      .eq('id', updatedCr.campaign_id);
  }
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
