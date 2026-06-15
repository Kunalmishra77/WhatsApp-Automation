import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';
import { getRequiredSecret } from '@/lib/supabase-env';
import { applyInboxRules } from '@/lib/inbox-rules-engine';
import { processFlowForMessage } from '@/lib/flow-engine';
import { dispatchWebhookEvent } from '@/lib/outbound-webhook';
import { checkAutoReplyLimit } from '@/lib/rate-limit';
import { isWithinBusinessHours, type BusinessHoursConfig } from '@/app/api/business-hours/route';
import { callAI } from '@/lib/ai-client';

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

// Per-workspace signature verification — app_secret is stored in workspace.settings.app_secret
function checkSignature(body: string, signature: string, appSecret: string): boolean {
  const clean = signature.trim();
  if (!clean.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(clean, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

// Extract phone_number_id from raw payload without fully parsing
function peekPhoneNumberId(rawBody: string): string | null {
  try {
    const p = JSON.parse(rawBody) as WhatsAppPayload;
    return p?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';

  // Parse JSON first (needed to get phone_number_id for workspace lookup)
  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Look up app_secret for this workspace (stored in workspace.settings.app_secret)
  const phoneNumberId = peekPhoneNumberId(rawBody);
  if (phoneNumberId) {
    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('settings')
      .eq('phone_number_id', phoneNumberId)
      .single();
    const appSecret: string | undefined = ws?.settings?.app_secret;

    if (appSecret && signature) {
      if (!checkSignature(rawBody, signature, appSecret)) {
        console.error('[Webhook] Invalid signature for phone_number_id:', phoneNumberId);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }
    // If no app_secret stored yet, skip signature check (client hasn't filled it in)
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
    .select('id, access_token')
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

  // Fetch contact flags needed for VIP routing
  const { data: contactFlags } = await (supabase as any)
    .from('contacts')
    .select('is_vip')
    .eq('id', contactId)
    .single();
  const contact = { id: contactId, is_vip: !!(contactFlags?.is_vip) };

  const { data: conversation, error: conversationError } = await (supabase as any)
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
    .select('id, bot_paused, sentiment')
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
      // Store interactive reply details for UI display and flow branching
      ...(msg.interactive && {
        interactive_reply: {
          type: msg.interactive.type,
          id:    msg.interactive.button_reply?.id ?? msg.interactive.list_reply?.id,
          title: msg.interactive.button_reply?.title ?? msg.interactive.list_reply?.title,
          description: msg.interactive.list_reply?.description,
        },
      }),
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

  // Mark incoming message as read — shows blue ticks on customer's WhatsApp (non-blocking)
  const _accessToken = (workspace as { id: string; access_token?: string }).access_token;
  if (_accessToken) {
    fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${_accessToken.replace(/﻿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: msg.id,
      }),
    }).catch(() => {});
  }

  // Track inbound message usage (non-blocking)
  void import('@/lib/usage-tracker').then(({ trackMessageIn }) => trackMessageIn(workspaceId)).catch(() => {});

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

  // ── WA Form session detection (before CSAT/rules/flow/AI) ───────────────────
  const formHandled = await checkAndHandleFormSession(
    supabase,
    conversation.id,
    workspaceId,
    contactId,
    waId,
    content,
    phoneNumberId,
    (workspace as any).access_token as string,
  );
  if (formHandled) {
    console.log(`[Webhook] Form session handled for conversation ${conversation.id}`);
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

    // Try flow engine first — structured conversation flows take priority
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
      // Flow handled → still do lead scoring + sentiment but skip AI reply
      autoCreateOrUpdateLead(supabase as any, workspaceId, contact.id, conversation.id, content).catch(() => {});
      if (content && content.length > 5) {
        updateConversationSentiment(supabase as any, conversation.id, content).catch(() => {});
      }
      return;
    }
  }

  // ── AI Auto-Lead Creation — non-blocking ────────────────────────────────────
  // On every inbound message, create/update a lead with AI-determined temperature
  autoCreateOrUpdateLead(supabase as any, workspaceId, contact.id, conversation.id, content).catch(() => {});

  // ── VIP contact — skip bot, route straight to human agent ──────────────────
  if (contact.is_vip) {
    await (supabase as any)
      .from('conversations')
      .update({ status: 'pending' })
      .eq('id', conversation.id);
    console.log(`[Webhook] VIP contact ${waId} — skipping bot, routing to agent`);
    return;
  }

  // ── Bot-pause guard — if agent has paused the bot, skip all AI processing ───
  if ((conversation as any).bot_paused === true) {
    console.log(`[Webhook] Bot paused for conversation ${conversation.id} — skipping AI`);
    return;
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

  // Check message limit before auto-reply
  try {
    const { getWorkspacePlan, guardMessageLimit } = await import('@/lib/plan-guard');
    const workspacePlan = await getWorkspacePlan(workspaceId);
    await guardMessageLimit(workspaceId, workspacePlan);
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PlanLimitError') {
      console.log(`[Webhook] Message limit exceeded for workspace ${workspaceId} — skipping auto-reply`);
      return;
    }
  }

  // Rate limit: max 1 auto-reply per 30s per contact
  const canReply = await checkAutoReplyLimit(contact.id);
  if (canReply) {
    // Vision AI: if image, download the media URL for multimodal processing
    let visionImageUrl: string | undefined;
    if (msg.type === 'image' && msg.image?.id) {
      const { data: wsForVision } = await (supabase as any)
        .from('workspaces')
        .select('access_token')
        .eq('id', workspaceId)
        .single();
      if (wsForVision?.access_token) {
        visionImageUrl = (await getWhatsAppMediaUrl(msg.image.id, wsForVision.access_token)) ?? undefined;
      }
    }

    // Build rich AI prompt for media messages so AI can reply contextually
    const aiPrompt = buildAiPrompt(msg, content);
    await sendAutoReply(supabase, waId, customerName, workspaceId, aiPrompt, conversation.id, contact.id, isEscalation, visionImageUrl);
  } else {
    console.log(`[AutoReply] Rate limited for contact ${contact.id} — skipping`);
  }
  console.log(`[Webhook] Message from ${waId}: ${content}`);

  // ── Non-blocking sentiment update ───────────────────────────────────────────
  if (content && content.length > 5) {
    updateConversationSentiment(supabase as any, conversation.id, content).catch(() => {});
  }
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
  try {
    const answer = await callAI(
      [
        {
          role: 'system',
          content:
            'Analyze if this customer message shows GENUINE anger, frustration, a complaint, or an urgent demand for human help (e.g. "this is fraud", "I want a refund", "you cheated me", "this is urgent"). Simple disinterest like "not interested", "nahi chahiye", "no thanks", or "mujhe interest nhi" should return false. Reply with ONLY "true" or "false".',
        },
        { role: 'user', content: message },
      ],
      { model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free', maxTokens: 5, temperature: 0 },
    );
    return answer?.toLowerCase().trim() === 'true';
  } catch {
    return false;
  }
}

async function detectLanguage(content: string): Promise<string | null> {
  try {
    const lang = await callAI(
      [
        {
          role: 'system',
          content:
            'Detect the language of the given text. Reply with ONLY the ISO 639-1 code (e.g. "en", "hi", "es", "ar", "fr"). No explanation.',
        },
        { role: 'user', content: content.slice(0, 200) },
      ],
      { model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free', maxTokens: 5, temperature: 0 },
    );
    const lower = lang?.toLowerCase().trim();
    return /^[a-z]{2,3}$/.test(lower ?? '') ? lower! : null;
  } catch {
    return null;
  }
}

async function categorizeMessage(content: string): Promise<string | null> {
  if (content.length < 10) return null;

  try {
    const label = await callAI(
      [
        {
          role: 'system',
          content:
            'Categorize this customer message into exactly ONE of these labels: billing, support, sales, complaint, inquiry, spam, general. Reply with ONLY the label word.',
        },
        { role: 'user', content },
      ],
      { model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free', maxTokens: 10, temperature: 0 },
    );
    const lower = label?.toLowerCase().trim();
    const validLabels = ['billing', 'support', 'sales', 'complaint', 'inquiry', 'spam', 'general'];
    return validLabels.includes(lower ?? '') ? lower! : null;
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
    const db = supabase as any;

    // Try semantic vector search first (pgvector)
    try {
      const { generateEmbedding, formatEmbedding } = await import('@/lib/embeddings');
      const queryEmbedding = await generateEmbedding(query);
      if (queryEmbedding) {
        const formattedEmbedding = formatEmbedding(queryEmbedding);

        // Search both knowledge_base entries AND uploaded file chunks (vector_documents)
        // Always combine both — never early-return on just one source
        const contextParts: string[] = [];

        const { data: vecResults } = await db.rpc('match_knowledge_base', {
          query_embedding: formattedEmbedding,
          workspace_id_param: workspaceId,
          match_count: 5,
        });
        if (vecResults?.length > 0) {
          contextParts.push(
            (vecResults as Array<{ title: string; content: string }>)
              .map((e) => `## ${e.title}\n${e.content}`)
              .join('\n\n')
          );
        }

        // Always also check uploaded file chunks
        const { data: vecDocResults } = await (db.rpc('match_vector_documents', {
          query_embedding: formattedEmbedding,
          workspace_id_param: workspaceId,
          match_count: 10,
          min_similarity: 0.15,
        }) as Promise<{ data: Array<{ filename: string; content: string }> | null }>).catch(() => ({ data: null }));

        if (vecDocResults?.length) {
          contextParts.push(
            (vecDocResults as Array<{ filename: string; content: string }>)
              .map((r) => `[${r.filename}] ${r.content}`)
              .join('\n\n')
          );
        }

        if (contextParts.length > 0) {
          return contextParts.join('\n\n');
        }
      }
    } catch {
      // pgvector function not yet created — fall through to keyword search
    }

    // Fallback: keyword scoring
    const { data: entries } = await db
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
      let score = (e.priority ?? 0) * 0.1;
      for (const w of queryWords) {
        if (titleLower.includes(w)) score += 3;
        else if (tagsText.includes(w)) score += 2;
        else if (contentLower.includes(w)) score += 1;
      }
      return { title: e.title, content: e.content, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter((e) => e.score > 0 || entries.length <= 5)
      .map((e) => `## ${e.title}\n${e.content}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

// Downloads a WhatsApp media URL from the Graph API (needed for Vision AI)
async function getWhatsAppMediaUrl(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken.replace(/\uFEFF/g, '').trim()}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

// \u2500\u2500 Parse BUTTON "Label" \u2192 response definitions from persona text \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function parseButtonResponses(persona: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of persona.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^BUTTON\s+"/i.test(trimmed)) continue;
    const labelMatch = /^BUTTON\s+"([^"]+)"/i.exec(trimmed);
    if (!labelMatch?.[1]) continue;
    const label = labelMatch[1].trim().toLowerCase();
    // Strip separator after closing quote: any arrows (\u2192 \u27a1 \u279c \u21d2 etc), dashes, colons, spaces
    const rest = trimmed.slice(labelMatch[0].length);
    const response = rest.replace(/^[\s\u2192\u27a1\u279c\u21d2\u2794\-=>:]+/, '').trim();
    if (response) map.set(label, response);
  }
  return map;
}

// \u2500\u2500 Extract button label from [Tapped button: "X"] or [Selected: "X"] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function extractButtonLabel(message: string): string | null {
  const m = /^\[(?:Tapped button|Selected):\s*"([^"]+)"\]$/i.exec(message.trim());
  return m?.[1]?.trim() ?? null;
}

// \u2500\u2500 Programmatic language detection \u2014 injected into user message so AI cannot ignore \u2500\u2500
function detectReplyLanguage(text: string): 'english' | 'hindi' | null {
  // Strip button/system tags before checking
  const clean = text.replace(/\[.*?\]/g, '').trim();
  if (!clean) return null;

  // Devanagari Unicode block \u2192 definitely Hindi script
  const devanagariChars = (clean.match(/[\u0900-\u097f]/g) ?? []).length;
  if (devanagariChars > 1) return 'hindi';

  // English indicator: common English-only words not found in Roman Hindi
  const hasEnglishWords = /\b(the|is|are|was|were|your|you\b|tell|about|first|what|how|when|where|why|please|thank|thanks|hello|hi\b|because|with|for\b|and\b|but\b|business|product|feature|price|demo|information|help|support|company|office|work|i am|i want|i need|can you|do you|are you|this is|that is)\b/i.test(clean);
  const latinLetters = (clean.match(/[a-zA-Z]/g) ?? []).length;

  if (latinLetters > 3 && hasEnglishWords) return 'english';

  return null; // Hinglish / ambiguous \u2014 let AI decide
}

async function getAIReply(
  customerMessage: string,
  customerName: string,
  kbContext = '',
  imageUrl?: string,
  wsSettings?: Record<string, unknown>,
  businessName = 'our team',
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Promise<string | null> {
  const { getModel } = await import('@/lib/ai-router');
  const model = imageUrl
    ? getModel(wsSettings ?? null, 'vision_model')
    : getModel(wsSettings ?? null, 'auto_reply_model');

  // Per-workspace agent persona overrides the generic prompt when set
  const agentPersona = (wsSettings?.agent_persona as string | undefined)?.trim() ?? '';

  // \u2500\u2500 Deterministic button responses (defined in persona, no AI needed) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (!imageUrl) {
    const buttonLabel = extractButtonLabel(customerMessage);
    if (buttonLabel) {
      const buttonMap = parseButtonResponses(agentPersona);
      const exactResponse = buttonMap.get(buttonLabel.toLowerCase());
      if (exactResponse) {
        console.log(`[AI] Deterministic button response for "${buttonLabel}"`);
        return exactResponse;
      }
    }
  }

  // \u2500\u2500 Conversation stage \u2014 adjusts AI behavior based on how far along we are \u2500\u2500\u2500
  const historyLen = conversationHistory.length;
  // Detect if customer is explicitly asking for product/feature information
  const isProductInfoQuery = /\b(tell me about|about your|what (do|can|does)|features?|how (does|do)|what is|explain|overview|benefits?|capabilities|product info|services?)\b/i.test(customerMessage);
  const conversationStage =
    isProductInfoQuery
      ? 'CONVERSATION STAGE: Customer asked for product information. Give a COMPLETE list of ALL features and benefits from the knowledge base. Do NOT skip any feature. Do NOT ask a qualifying question \u2014 instead end with an offer to demo or explore a specific feature.'
      : historyLen === 0
      ? 'CONVERSATION STAGE: First message. Respond warmly and ask ONE question to understand what they need.'
      : historyLen <= 3
      ? 'CONVERSATION STAGE: Early. You know a little about them. Ask one qualifying question (e.g. team size, current process, main problem) if not yet asked.'
      : historyLen <= 7
      ? 'CONVERSATION STAGE: Mid. You understand their situation. Provide specific value, address their concern, and offer a clear next step (demo / pricing / trial).'
      : 'CONVERSATION STAGE: Extended. Focus on resolving any remaining objection and confirming the next step. If they seem stuck, offer to connect them with a team member.';

  const kbSection = kbContext
    ? `\n\nKNOWLEDGE BASE \u2014 answer from this accurately:\n${kbContext}\n\nIMPORTANT: When the customer asks about features, products, or "about your business", list EVERY feature mentioned in the knowledge base above \u2014 do not pick only 2-3. Only use information from the knowledge base. If a topic is not covered, say a team member will follow up \u2014 do NOT guess or invent.`
    : '\nIf you do not know the answer, say a team member will follow up \u2014 do NOT guess or invent information.';

  const basePersona = agentPersona
    ? agentPersona
    : `You are a helpful WhatsApp customer support assistant for ${businessName}.`;

  const systemPrompt = `${basePersona}

RULES (follow strictly):
- Customer name: ${customerName}. Greet by name at most once \u2014 after that, continue naturally without repeating the greeting.
- Reply length: Match the question. Simple conversational replies (yes/no, quick answers) \u2192 1-2 sentences. Product/feature questions ("tell me about your product", "what can you do", "what features") \u2192 give a complete, structured answer with all relevant points. Never cut short a product explanation just to be brief.
- WhatsApp formatting: Use *single asterisk* for bold headings/feature names. Use plain hyphens (-) for bullet lists. NEVER use ** double asterisk, ##, or other markdown \u2014 WhatsApp ignores those.
- End replies with ONE clear question or call-to-action \u2014 do not list multiple options.
- BUTTON HANDLING: When message starts with "[Tapped button:" or "[Selected:", respond ONLY to that button's intent. Never say "you tapped" or "you clicked". Use persona-defined responses if available (BUTTON definitions above). Otherwise:
  \u2022 "Know more" / "Learn more" \u2192 explain the core value/benefit of your product. Do NOT jump to demo.
  \u2022 "Not Interested" / "No thanks" \u2192 acknowledge warmly, close gracefully. Do NOT pitch or continue selling.
  \u2022 "Book Demo" / "Schedule Demo" \u2192 confirm interest, ask for preferred day/time.
  \u2022 "Contact Us" / "Talk to Agent" \u2192 say a team member will reach out soon.
  \u2022 Any other button \u2192 respond directly to what that label means.
- Never invent product names, prices, or features not in the knowledge base.
${conversationStage}
${kbSection}

CRITICAL LANGUAGE RULE \u2014 HIGHEST PRIORITY, OVERRIDES EVERYTHING ABOVE:
Identify the language of the customer's CURRENT message (the last message they sent, not previous history).
- If the customer wrote in ENGLISH \u2192 your reply MUST be in English only. No Hindi words.
- If the customer wrote in HINDI (Devanagari or Roman Hindi) \u2192 your reply MUST be in Hindi only. No English sentences.
- If the customer wrote in HINGLISH (mixed) \u2192 reply in the same Hinglish mix they used.
- The persona language, previous messages, and conversation history do NOT determine your reply language. Only the customer's current message does.
- When in doubt: match the script the customer used (English letters \u2192 English reply, Hindi/Roman-Hindi \u2192 Hindi reply).`;

  // Vision path: multimodal content (image URL array) requires direct OpenRouter fetch
  if (imageUrl) {
    const apiKey = process.env.OPENROUTER_API_KEY?.replace(/\uFEFF/g, '').trim();
    if (!apiKey) {
      console.warn('[AI] OPENROUTER_API_KEY not set \u2014 using fallback reply');
      return null;
    }
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
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageUrl } },
                { type: 'text', text: customerMessage || 'What is in this image? Respond helpfully.' },
              ],
            },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[AI] OpenRouter vision error ${res.status}:`, errBody);
        return null;
      }
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data?.choices?.[0]?.message?.content?.trim() ?? null;
      if (!reply) console.warn('[AI] Empty response from OpenRouter (vision)');
      return reply;
    } catch (error) {
      console.error('[AI] Vision fetch error:', error);
      return null;
    }
  }

  // Text path: use the central AI client with conversation history for context
  try {
    // Programmatically detect language and append an instruction the AI cannot ignore
    const detectedLang = detectReplyLanguage(customerMessage);
    const langInstruction = detectedLang === 'english'
      ? '\n\n[SYSTEM OVERRIDE: Customer wrote in English. You MUST reply in English only. No Hindi.]'
      : detectedLang === 'hindi'
      ? '\n\n[SYSTEM OVERRIDE: Customer wrote in Hindi. You MUST reply in Hindi only. No English sentences.]'
      : '';
    const userContent = customerMessage + langInstruction;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userContent },
    ];
    const reply = await callAI(messages, { model, maxTokens: 350, temperature: 0.4 });
    if (!reply) console.warn('[AI] Empty response from AI client');
    return reply;
  } catch (error) {
    console.error('[AI] Network/parse error:', error);
    return null;
  }
}

// ── AI Auto-Lead: create/update lead based on conversation content ───────────
const HOT_KEYWORDS  = ['buy', 'purchase', 'price', 'cost', 'how much', 'interested', 'want', 'need', 'demo', 'trial', 'order', 'book', 'plan', 'pricing', 'quote', 'kharidna', 'lena hai', 'chahiye', 'kitna', 'rate'];
const COLD_KEYWORDS = ['later', 'maybe', 'not now', 'baad mein', 'sochenge', 'dekhenge', 'no thanks', 'nahi chahiye', 'wrong number'];

function detectLeadTemperature(text: string): 'hot' | 'warm' | 'cold' {
  const lower = text.toLowerCase();
  if (HOT_KEYWORDS.some((k)  => lower.includes(k))) return 'hot';
  if (COLD_KEYWORDS.some((k) => lower.includes(k))) return 'cold';
  return 'warm';
}

async function autoCreateOrUpdateLead(
  db: any,
  workspaceId: string,
  contactId: string,
  conversationId: string,
  messageContent: string,
) {
  try {
    const temperature = detectLeadTemperature(messageContent);

    // Check if lead already exists for this contact
    const { data: existing } = await db
      .from('leads')
      .select('id, temperature, stage')
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update temperature only if escalating (cold → warm → hot, never downgrade)
      const rank: Record<string, number> = { cold: 0, warm: 1, hot: 2 };
      const currentRank = rank[existing.temperature as string] ?? 1;
      const newRank     = rank[temperature] ?? 1;
      if (newRank > currentRank) {
        await db.from('leads').update({ temperature, conversation_id: conversationId }).eq('id', existing.id);
      }
      return;
    }

    // Fetch contact name to build lead title
    const { data: contactRow } = await db
      .from('contacts')
      .select('name, phone')
      .eq('id', contactId)
      .single();

    const displayName = contactRow?.name ?? contactRow?.phone ?? 'Unknown Contact';

    // Create new lead automatically
    await db.from('leads').insert({
      workspace_id:    workspaceId,
      contact_id:      contactId,
      conversation_id: conversationId,
      title:           `Lead — ${displayName}`,
      stage:           'new',
      temperature,
      priority:        'medium',
      tags:            [],
      custom_fields:   {},
    });

    console.log(`[AutoLead] Created lead for contact ${contactId} — temperature: ${temperature}`);
  } catch {
    // silent fail — lead creation is non-critical
  }
}

// Lightweight sentiment classifier — updates conversation.sentiment non-blocking
async function updateConversationSentiment(db: any, conversationId: string, text: string) {
  try {
    const raw = await callAI(
      [
        {
          role: 'system',
          content: 'Classify the sentiment of this customer message. Reply with ONLY one word: positive, neutral, or negative.',
        },
        { role: 'user', content: text },
      ],
      { model: 'openai/gpt-4o-mini', maxTokens: 5, temperature: 0 },
    );
    const sentiment = raw && ['positive', 'neutral', 'negative'].includes(raw.toLowerCase().trim())
      ? raw.toLowerCase().trim()
      : null;
    if (sentiment) {
      await db.from('conversations').update({ sentiment }).eq('id', conversationId);
    }
  } catch {
    // silent fail — sentiment is non-critical
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
  imageUrl?: string,
) {
  const { data: ws } = await (supabase as any)
    .from('workspaces')
    .select('phone_number_id, access_token, settings, name')
    .eq('id', workspaceId)
    .single();

  if (!ws?.phone_number_id || !ws?.access_token) return;

  const name = customerName !== toPhone ? (customerName.split(' ')[0] ?? customerName) : 'there';
  const businessName = (ws.name as string | undefined) ?? 'our team';

  // Fetch active KB entries for this workspace to inject as context
  const kbContext = await fetchKnowledgeBaseContext(supabase, workspaceId, customerMessage);

  const wsSettings = (ws?.settings ?? {}) as Record<string, unknown>;

  // Fetch last 6 messages for conversation history context (skip current = last inserted)
  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (conversationId) {
    try {
      const { data: recentMsgs } = await (supabase as any)
        .from('messages')
        .select('content, sender_type, direction')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(7);
      if (recentMsgs && recentMsgs.length > 1) {
        conversationHistory = (recentMsgs as Array<{ content: string; sender_type: string }>)
          .slice(1)        // skip the just-inserted current message
          .reverse()
          .map((m) => ({
            role: m.sender_type === 'contact' ? ('user' as const) : ('assistant' as const),
            content: m.content ?? '',
          }))
          .filter((m) => m.content.length > 0);
      }
    } catch {
      // non-blocking — proceed without history
    }
  }

  // \u2500\u2500 Image Intent Detection \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // If customer asks for photos/images, search media library and send matching images
  const imageIntent = detectImageIntent(customerMessage);
  if (!isEscalation && imageIntent) {
    const mediaItems = await searchMediaLibrary(supabase, workspaceId, imageIntent.keywords);
    if (mediaItems.length > 0) {
      await sendMediaImages(ws.phone_number_id, ws.access_token, toPhone, mediaItems.slice(0, 3));
      // Also send a text message
      const textMsg = `Here are ${mediaItems.length > 1 ? mediaItems.length + ' images' : 'an image'} for "${imageIntent.query}" \uD83D\uDCF8`;
      await sendWhatsAppText(ws.phone_number_id, ws.access_token, toPhone, textMsg);
      // Save to DB
      if (conversationId && contactId) {
        await (supabase as any).from('messages').insert({
          conversation_id: conversationId,
          workspace_id:    workspaceId,
          contact_id:      contactId,
          direction:       'outbound',
          content:         textMsg,
          msg_type:        'text',
          status:          'sent',
          sender_type:     'bot',
          created_at:      new Date().toISOString(),
        });
      }
      return;
    }
  }
  // \u2500\u2500 End Image Intent \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const message = isEscalation
    ? ESCALATION_REPLY
    : (await getAIReply(customerMessage, name, kbContext, imageUrl, wsSettings, businessName, conversationHistory)
      ?? `Thanks for reaching out to ${businessName}! Our team received your message and will get back to you shortly.`);

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

      const updatePayload: Record<string, unknown> = {
        last_message:    message,
        last_message_at: now,
      };
      // Stop bot from looping after escalation — human agent takes over
      if (isEscalation) {
        updatePayload.bot_paused = true;
      }
      await (supabase as any).from('conversations').update(updatePayload).eq('id', conversationId);
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
  // Accept single-digit 1–5; trimmed must be exactly one character after stripping whitespace
  if (isNaN(score) || score < 1 || score > 5 || trimmed !== String(score)) return false;

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
  const ts = new Date(parseInt(status.timestamp, 10) * 1000).toISOString();
  if (status.status === 'delivered') patch.delivered_at = ts;
  if (status.status === 'read')      patch.read_at      = ts;
  if (status.status === 'failed')    patch.failed_at    = ts;

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

  if (updatedCr?.campaign_id && ['delivered', 'read', 'failed'].includes(status.status)) {
    // Re-aggregate from campaign_recipients (accurate regardless of event order)
    const { data: rows } = await db
      .from('campaign_recipients')
      .select('status')
      .eq('campaign_id', updatedCr.campaign_id);

    const allRows = (rows ?? []) as Array<{ status: string }>;
    const deliveredCount = allRows.filter((r) => ['delivered', 'read', 'replied'].includes(r.status)).length;
    const readCount      = allRows.filter((r) => ['read', 'replied'].includes(r.status)).length;
    const failedCount    = allRows.filter((r) => r.status === 'failed').length;

    await db
      .from('campaigns')
      .update({ delivered_count: deliveredCount, read_count: readCount, failed_count: failedCount })
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

// ── WA Form session handler ───────────────────────────────────────────────────
async function checkAndHandleFormSession(
  supabase: AdminClient,
  conversationId: string,
  workspaceId: string,
  contactId: string,
  contactPhone: string,
  answer: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<boolean> {
  const db = supabase as any;

  // Find active form session for this conversation
  const { data: session } = await db
    .from('wa_form_sessions')
    .select('*, wa_forms(questions, completion_message, workspace_id, name)')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .maybeSingle();

  if (!session) return false;

  const form = session.wa_forms as { questions: Array<{ id: string; text: string; type: string; options?: string[] }>; completion_message: string; workspace_id: string } | null;
  if (!form) return false;

  const questions   = form.questions ?? [];
  const currentIdx  = session.current_question_idx as number;
  const currentQ    = questions[currentIdx];
  if (!currentQ) return false;

  // Save answer
  const updatedAnswers = { ...(session.answers as Record<string, string> ?? {}), [currentQ.id]: answer.trim() };
  const nextIdx = currentIdx + 1;
  const token   = accessToken.replace(/﻿/g, '').trim();

  if (nextIdx >= questions.length) {
    // Form complete — save response + mark session done
    await db.from('wa_form_sessions').update({
      current_question_idx: nextIdx,
      answers:              updatedAnswers,
      status:               'completed',
      completed_at:         new Date().toISOString(),
    }).eq('id', session.id);

    // Get contact info for response record
    const { data: contact } = await db.from('contacts').select('name, phone').eq('id', contactId).single();

    await db.from('wa_form_responses').insert({
      form_id:       session.form_id,
      workspace_id:  workspaceId,
      contact_id:    contactId,
      contact_name:  contact?.name ?? null,
      contact_phone: contact?.phone ?? contactPhone,
      answers:       updatedAnswers,
    });

    // Increment form total_responses
    await db.rpc('increment_form_responses', { form_id_input: session.form_id }).catch(() => {
      db.from('wa_forms').select('total_responses').eq('id', session.form_id).single()
        .then(({ data }: any) => {
          if (data) db.from('wa_forms').update({ total_responses: (data.total_responses ?? 0) + 1 }).eq('id', session.form_id);
        });
    });

    // Send completion message
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: contactPhone,
        type: 'text',
        text: { preview_url: false, body: form.completion_message },
      }),
    });
  } else {
    // Advance to next question
    await db.from('wa_form_sessions').update({
      current_question_idx: nextIdx,
      answers:              updatedAnswers,
    }).eq('id', session.id);

    // Send next question
    const nextQ = questions[nextIdx];
    const { sendFormQuestion } = await import('@/app/api/wa-forms/[id]/send/route');
    if (nextQ) await sendFormQuestion(phoneNumberId, token, contactPhone, nextQ, nextIdx, questions.length);
  }

  return true;
}
// ─────────────────────────────────────────────────────────────────────────────

function extractMessageContent(msg: WAMessage): string {
  switch (msg.type) {
    case 'text': return msg.text?.body ?? '';
    case 'image': return msg.image?.caption ?? '[Image]';
    case 'video': return msg.video?.caption ?? '[Video]';
    case 'audio': return '[Audio]';
    case 'document': return msg.document?.filename ?? '[Document]';
    case 'location': return `[Location: ${msg.location?.latitude},${msg.location?.longitude}]`;
    case 'sticker': return '[Sticker]';
    case 'button': return `[Tapped button: "${msg.button?.text ?? 'button'}"]`;
    case 'interactive': {
      const ir = msg.interactive;
      if (ir?.type === 'button_reply') return `[Tapped button: "${ir.button_reply?.title ?? 'button'}"]`;
      if (ir?.type === 'list_reply')   return `[Selected: "${ir.list_reply?.title ?? 'option'}"]`;
      return '[Interactive]';
    }
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

interface WAInteractiveReply {
  type: 'button_reply' | 'list_reply';
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string; description?: string };
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
  interactive?: WAInteractiveReply;
  // Template quick-reply button tap (type = "button")
  button?: { text: string; payload?: string };
}

interface WAStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

// ── Image Intent Detection ────────────────────────────────────────────────────

const IMAGE_KEYWORDS = [
  'photo', 'photos', 'image', 'images', 'picture', 'pictures', 'pic', 'pics',
  'dikhao', 'dikha', 'dekh', 'dekhna', 'dekho', 'show', 'send photo', 'photo bhejo',
  'image bhejo', 'photo send', 'catalog', 'catalogue', 'gallery', 'brochure',
];

function detectImageIntent(message: string): { query: string; keywords: string[] } | null {
  const lower = message.toLowerCase();
  const hasImageRequest = IMAGE_KEYWORDS.some((kw) => lower.includes(kw));
  if (!hasImageRequest) return null;

  // Extract what they want (remove image keywords to get the subject)
  const cleaned = lower
    .replace(/show me|send|bhejo|dikha|dikhao|dekho|please|hi|hello|the|a |an /g, '')
    .replace(/photos?|images?|pictures?|pics?|catalog(?:ue)?|gallery/g, '')
    .trim();

  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  return { query: cleaned || message, keywords: words.length > 0 ? words : ['product'] };
}

async function searchMediaLibrary(
  supabase: AdminClient,
  workspaceId: string,
  keywords: string[],
): Promise<Array<{ media_id: string; public_url: string | null; filename: string; media_type: string }>> {
  try {
    // Try tag-based search first
    const { data: tagResults } = await (supabase as any)
      .from('media_library')
      .select('media_id, public_url, filename, media_type, tags')
      .eq('workspace_id', workspaceId)
      .eq('media_type', 'image')
      .overlaps('tags', keywords)
      .order('created_at', { ascending: false })
      .limit(5);

    if (tagResults?.length) return tagResults;

    // Fallback: search by filename
    const { data: nameResults } = await (supabase as any)
      .from('media_library')
      .select('media_id, public_url, filename, media_type')
      .eq('workspace_id', workspaceId)
      .eq('media_type', 'image')
      .ilike('filename', `%${keywords[0] ?? ''}%`)
      .order('created_at', { ascending: false })
      .limit(3);

    return nameResults ?? [];
  } catch {
    return [];
  }
}

async function sendMediaImages(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  items: Array<{ media_id: string; public_url: string | null; filename: string }>,
): Promise<void> {
  const token = accessToken.replace(/﻿/g, '').trim();
  for (const item of items) {
    const imageUrl = item.public_url ?? item.media_id;
    if (!imageUrl?.startsWith('http')) continue;
    try {
      await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                toPhone,
          type:              'image',
          image:             { link: imageUrl, caption: item.filename },
        }),
      });
    } catch (err) {
      console.error('[sendMediaImages] failed for', item.filename, err);
    }
  }
}

async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  text: string,
): Promise<void> {
  const token = accessToken.replace(/﻿/g, '').trim();
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                toPhone,
      type:              'text',
      text:              { preview_url: false, body: text },
    }),
  });
}
