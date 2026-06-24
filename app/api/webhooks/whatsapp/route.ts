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
import {
  categorizeMessage,
  fetchKnowledgeBaseContext,
  getAIReply,
  detectLeadTemperature,
} from '@/lib/ai-reply';

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

  // Check existing conversation status BEFORE upsert so we can reset bot_paused
  // when a resolved conversation gets a new inbound message (customer starting fresh).
  const { data: existingConv } = await (supabase as any)
    .from('conversations')
    .select('status, bot_paused')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contact.id)
    .maybeSingle();

  const wasResolved = existingConv?.status === 'resolved' || existingConv?.status === 'closed';

  const { data: conversation, error: conversationError } = await (supabase as any)
    .from('conversations')
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id: contact.id,
        status: 'open',
        channel: 'whatsapp',
        last_message_at: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
        // Reset bot_paused when conversation reopens after being resolved —
        // customer is starting fresh, bot should be active again.
        ...(wasResolved ? { bot_paused: false } : {}),
      },
      { onConflict: 'workspace_id,contact_id', ignoreDuplicates: false },
    )
    .select('id, bot_paused, sentiment')
    .single();

  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? 'Failed to upsert WhatsApp conversation');
  }

  const content = extractMessageContent(msg);
  // 'button' = customer tapped a quick-reply button on a template → save as button_reply type
  const messageType = msg.type === 'button' ? 'button_reply' : toMessageType(msg.type);
  const createdAt = new Date(parseInt(msg.timestamp, 10) * 1000).toISOString();

  // For inbound media, save proxy URL so the UI can display it directly.
  // The proxy fetches fresh download URLs from Meta on each request (media IDs are permanent).
  const inboundMediaId = msg.image?.id ?? msg.video?.id ?? msg.audio?.id ?? msg.document?.id ?? null;
  const inboundMediaUrl = inboundMediaId
    ? `/api/media/proxy?mediaId=${encodeURIComponent(inboundMediaId)}&workspaceId=${encodeURIComponent(workspaceId)}`
    : null;

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
    media_url: inboundMediaUrl,
    media_filename: msg.document?.filename ?? null,
    caption: msg.image?.caption ?? msg.video?.caption ?? null,
    metadata: {
      whatsapp: msg,
      display_phone_number: metadata.display_phone_number,
      // Template button tap — store button text + payload for UI display
      ...(msg.type === 'button' && msg.button && {
        button_reply: {
          text:    msg.button.text,
          payload: msg.button.payload,
        },
      }),
      // Interactive list/button reply
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

  // ── Campaign reply detection ─────────────────────────────────────────────────
  // Must run before opt-out/order/form/CSAT handlers below, since those can
  // `return` early — any inbound message should still count as a campaign reply
  // regardless of what other feature also handles it.
  {
    // Primary lookup: by contact_id — fetch sent_at + whatsapp_msg_id to save campaign msg retroactively
    let { data: pendingCr, error: crFindErr } = await (supabase as any)
      .from('campaign_recipients')
      .select('id, sent_at, whatsapp_msg_id, campaign_id, conversation_id')
      .eq('contact_id', contactId)
      .eq('workspace_id', workspaceId)
      .not('status', 'in', '(failed,replied,filtered)')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (crFindErr) console.error('[Webhook] Campaign reply lookup error:', crFindErr.message);

    // Fallback: by phone (covers CSV/manual campaigns where contact_id is NULL in campaign_recipients)
    if (!pendingCr && waId) {
      const { data: phoneCr, error: phoneCrErr } = await (supabase as any)
        .from('campaign_recipients')
        .select('id, sent_at, whatsapp_msg_id, campaign_id, conversation_id')
        .eq('phone', waId)
        .eq('workspace_id', workspaceId)
        .not('status', 'in', '(failed,replied,filtered)')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (phoneCrErr) console.error('[Webhook] Campaign reply phone-lookup error:', phoneCrErr.message);
      if (phoneCr) pendingCr = phoneCr;
    }

    if (pendingCr) {
      // ── Retroactively save the campaign outbound message to messages table ───
      // Campaign executor never saves to messages — so conversations appear empty.
      // On first reply, we insert the original campaign message so the thread makes sense.
      if (!pendingCr.conversation_id && conversation?.id) {
        try {
          // Get campaign body to use as message content
          const { data: camp } = await (supabase as any)
            .from('campaigns')
            .select('name, text_content, templates(body)')
            .eq('id', pendingCr.campaign_id)
            .maybeSingle();
          const campaignBody: string = (camp as any)?.text_content ?? (camp as any)?.templates?.body ?? `[Campaign: ${(camp as any)?.name ?? 'message'}]`;
          const sentAt = pendingCr.sent_at ?? new Date(Date.now() - 60000).toISOString();

          await (supabase as any).from('messages').insert({
            conversation_id: conversation.id,
            workspace_id:    workspaceId,
            contact_id:      contactId ?? null,
            direction:       'outbound',
            sender_type:     'campaign',
            type:            'text',
            content:         campaignBody,
            whatsapp_msg_id: pendingCr.whatsapp_msg_id ?? null,
            status:          'delivered',
            created_at:      sentAt,
          });
        } catch (e) {
          console.error('[Webhook] Failed to retroactively save campaign message:', e);
        }
      }

      // msg.type='button'  → template quick-reply button tap (most common from campaigns)
      // msg.type='interactive' → interactive list/button (rich menus)
      const isButton = msg.type === 'button' || msg.type === 'interactive';
      const replyText = msg.type === 'button'
        ? (msg.button?.text ?? content)
        : msg.type === 'interactive'
        ? (msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? content)
        : content;

      const { error: crUpdateErr } = await (supabase as any)
        .from('campaign_recipients')
        .update({
          status:          'replied',
          replied_at:      new Date().toISOString(),
          reply_type:      isButton ? 'button' : 'text',
          reply_text:      replyText ?? null,
          conversation_id: conversation?.id ?? null,
        })
        .eq('id', pendingCr.id);

      if (crUpdateErr) console.error('[Webhook] Campaign reply update error:', crUpdateErr.message, 'cr_id:', pendingCr.id);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

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
    // Strip BOM and whitespace from access_token — clients often copy-paste tokens
    // from Windows apps which prepend an invisible BOM (﻿) that breaks Meta API auth.
    const cleanToken = (wsForRules.access_token as string).replace(/﻿/g, '').trim();

    await applyInboxRules(
      supabase,
      workspaceId,
      content,
      conversation.id,
      contact.id,
      isFirstMessage,
      wsForRules.phone_number_id,
      cleanToken,
    );

    // Try flow engine first — structured conversation flows take priority
    const flowHandled = await processFlowForMessage(
      supabase,
      workspaceId,
      conversation.id,
      contactId,
      content,
      wsForRules.phone_number_id,
      cleanToken,
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

  // ── Bot-pause guard — if agent has manually paused the bot, skip AI ─────────
  // Note: bot_paused is only set by human agents via the dashboard toggle,
  // NOT automatically after escalation — that was causing customers to be
  // left with no reply after a false escalation with no agent available.
  if ((conversation as any).bot_paused === true) {
    console.log(`[Webhook] Bot paused for conversation ${conversation.id} — skipping AI`);
    return;
  }

  // ── Run categorize + sentiment + business-hours fetch in parallel ────────────
  // Previously sequential (6-8s overhead). Now parallel: total wait = slowest of the three.
  const keywordEscalation = checkEscalationKeywords(content);

  const [intentLabel, aiSentimentResult, bhConfigResult] = await Promise.all([
    // 1. Intent categorization — 5s timeout, gpt-4o-mini is fast enough to always finish
    categorizeMessage(content).catch(() => null),

    // 2. AI sentiment escalation (only if no keyword match and message is long enough)
    (!keywordEscalation && content.length > 20)
      ? detectNegativeSentiment(content).catch(() => false)
      : Promise.resolve(false),

    // 3. Business hours config fetch
    (supabase as any)
      .from('business_hours')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ]);

  // Update conversation labels async (non-blocking)
  if (intentLabel) {
    const supabaseForCat = supabase;
    const convIdForCat = conversation.id;
    (async () => {
      const { data: conv } = await (supabaseForCat as any)
        .from('conversations')
        .select('labels')
        .eq('id', convIdForCat)
        .single();
      const existing: string[] = conv?.labels ?? [];
      if (!existing.includes(intentLabel)) {
        await (supabaseForCat as any)
          .from('conversations')
          .update({ labels: [...existing, intentLabel] })
          .eq('id', convIdForCat);
      }
    })().catch(() => {});
  }

  // Resolve escalation
  let isEscalation = keywordEscalation;
  if (keywordEscalation) {
    await (supabase as any)
      .from('conversations')
      .update({ status: 'pending' })
      .eq('id', conversation.id);
    console.log(`[Webhook] Keyword escalation detected for conversation ${conversation.id}`);
  } else if (aiSentimentResult) {
    isEscalation = true;
    await (supabase as any)
      .from('conversations')
      .update({ status: 'pending' })
      .eq('id', conversation.id);
    console.log(`[Webhook] AI sentiment escalation detected for conversation ${conversation.id}`);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const bhConfig = bhConfigResult?.data;

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
    await sendAutoReply(supabase, waId, customerName, workspaceId, aiPrompt, conversation.id, contact.id, isEscalation, intentLabel, visionImageUrl);
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
            'Analyze if this customer message shows GENUINE anger, a serious complaint, or an urgent demand for a human agent. Reply ONLY "true" or "false".\n\nReturn TRUE only for: explicit threats ("I will complain"), accusations of fraud/cheating ("you cheated me", "fraud hai", "thagi"), demand for refund on a purchased product, or explicit request for a human agent ("connect me to agent", "human se baat karo").\n\nReturn FALSE for: asking about price ("price kya hai", "kitna price hai", "bina price jane"), sales objections ("why should I order", "kyu order karu"), asking for more information, expressing doubt about a product, saying not interested, or any normal sales conversation.',
        },
        { role: 'user', content: message },
      ],
      { model: 'openai/gpt-4o-mini', maxTokens: 5, temperature: 0 },
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

// ── AI Auto-Lead: create/update lead based on conversation content ───────────
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
  "Hum aapki baat samajhte hain 🙏 Hamari team aapki madad ke liye available hai.\n\nPlease call karein: 📞 93191 35065\nYa email karein: care.razorveda@gmail.com\n\nYa phir www.razorveda.in visit karein — team turant help karegi! 😊";

async function sendAutoReply(
  supabase: AdminClient,
  toPhone: string,
  customerName: string,
  workspaceId: string,
  customerMessage = '',
  conversationId?: string,
  contactId?: string,
  isEscalation = false,
  intentLabel?: string | null,
  imageUrl?: string,
) {
  const { data: ws } = await (supabase as any)
    .from('workspaces')
    .select('phone_number_id, access_token, settings, name')
    .eq('id', workspaceId)
    .single();

  if (!ws?.phone_number_id || !ws?.access_token) {
    console.error(`[AutoReply] Skipping workspace ${workspaceId} — missing phone_number_id or access_token. Check WhatsApp settings.`);
    return;
  }

  const name = customerName !== toPhone ? (customerName.split(' ')[0] ?? customerName) : 'there';
  const businessName = (ws.name as string | undefined) ?? 'our team';

  // Fetch active KB entries for this workspace to inject as context
  const kbContext = await fetchKnowledgeBaseContext(supabase, workspaceId, customerMessage);

  const wsSettings = (ws?.settings ?? {}) as Record<string, unknown>;

  // Fetch last 40 messages for conversation history context (skip current = last inserted)
  // 40 covers the longest real WhatsApp sales conversations (20 Q&A turns).
  // Each message is ~20-50 tokens so 40 msgs ≈ 1500 extra tokens — negligible cost.
  let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (conversationId) {
    try {
      const { data: recentMsgs } = await (supabase as any)
        .from('messages')
        .select('content, sender_type, direction')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(41);
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
  // ── Payment Intent Detection ─────────────────────────────────────────────────
  // When customer ready to pay → send scanner image from media library
  if (!isEscalation && detectPaymentIntent(customerMessage)) {
    const scannerItems = await searchMediaLibrary(supabase, workspaceId, ['scanner', 'payment', 'qr']);
    if (scannerItems.length > 0) {
      const scanner = scannerItems[0]!;
      const scanRawUrl = scanner.public_url ?? scanner.media_id ?? '';
      if (scanRawUrl.startsWith('http')) {
        const token = ws.access_token.replace(/﻿/g, '').trim();
        const uploaded = await uploadMediaToWhatsApp(ws.phone_number_id, token, scanRawUrl);
        if (uploaded) {
          const scanRes = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp', recipient_type: 'individual', to: toPhone,
              type: uploaded.waType,
              [uploaded.waType]: { id: uploaded.mediaId, caption: 'Payment QR / Scanner 📲' },
            }),
          });
          const scanData = await scanRes.json() as { messages?: Array<{ id: string }> };
          await saveOutboundMessage(supabase, conversationId, workspaceId, contactId, {
            type: 'image', content: 'Payment QR / Scanner', media_url: scanRawUrl,
            whatsapp_msg_id: (scanData as any)?.messages?.[0]?.id,
          });
        }
      }
      const paymentPrompt = `${customerMessage}\n\n[SYSTEM: Scanner/QR image has been sent. Now tell customer: exact amount to pay, scan QR and pay via UPI, send screenshot of payment confirmation. Also confirm order is placed and will be delivered in 5-6 working days after team verifies payment.]`;
      const payMsg = await getAIReply(paymentPrompt, name, kbContext, undefined, wsSettings, businessName, conversationHistory, intentLabel);
      if (payMsg) {
        await sendWhatsAppText(ws.phone_number_id, ws.access_token, toPhone, payMsg);
        await saveOutboundMessage(supabase, conversationId, workspaceId, contactId, { type: 'text', content: payMsg });
      }
      return;
    }
  }

  // ── Image Intent Detection ────────────────────────────────────────────────────
  // Triggered when customer asks for images/photos (requires ≥2 words in message).
  // Uses product keywords from conversation history so we show the RIGHT product images.
  if (!isEscalation && detectImageIntent(customerMessage)) {
    console.log(`[ImageIntent] triggered for: "${customerMessage.slice(0, 60)}"`);
    // Build keywords from conversation context (product name being discussed) + customer message
    const productKeywords = extractProductKeywords(conversationHistory, customerMessage);
    const searchKeywords = productKeywords.length > 0 ? productKeywords : ['product', 'catalog'];
    console.log(`[ImageIntent] searching with keywords: ${JSON.stringify(searchKeywords)}`);
    const mediaItems = await searchMediaLibrary(supabase, workspaceId, searchKeywords, true);
    console.log(`[ImageIntent] found ${mediaItems.length} items from workspace ${workspaceId}`);

    if (mediaItems.length > 0) {
      const token = ws.access_token.replace(/﻿/g, '').trim();

      // Start AI reply generation in parallel with image uploads — saves 2-4 seconds
      const aiReplyPromise = getAIReply(customerMessage, name, kbContext, undefined, wsSettings, businessName, conversationHistory, intentLabel);

      // Upload + send images (while AI is thinking in parallel)
      let sentCount = 0;
      for (const item of mediaItems.slice(0, 3)) {
        const rawUrl = item.public_url ?? item.media_id ?? '';
        if (!rawUrl.startsWith('http')) { console.log(`[ImageIntent] skip no-url: ${item.filename}`); continue; }
        try {
          const uploaded = await uploadMediaToWhatsApp(ws.phone_number_id, token, rawUrl);
          if (!uploaded) { console.error(`[ImageIntent] upload failed: ${item.filename}`); continue; }
          const msgRes = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp', recipient_type: 'individual', to: toPhone,
              type: uploaded.waType,
              [uploaded.waType]: { id: uploaded.mediaId },
            }),
          });
          const msgData = await msgRes.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
          if ((msgData as any).error) { console.error(`[ImageIntent] send error: ${item.filename}:`, (msgData as any).error.message); continue; }
          await saveOutboundMessage(supabase, conversationId, workspaceId, contactId, {
            type: uploaded.waType, content: item.filename, media_url: rawUrl,
            whatsapp_msg_id: msgData?.messages?.[0]?.id,
          });
          sentCount++;
        } catch (e) { console.error('[ImageIntent] exception:', e); }
      }
      console.log(`[ImageIntent] sent ${sentCount} images`);

      // AI reply is likely ready by now (was running in parallel)
      const aiReply = await aiReplyPromise;
      const textMsg = aiReply ?? 'Ye hamare products hain 📸 Aapko kaunsa size chahiye?';
      await sendWhatsAppText(ws.phone_number_id, ws.access_token, toPhone, textMsg);
      await saveOutboundMessage(supabase, conversationId, workspaceId, contactId, { type: 'text', content: textMsg });
      return;
    }

    // Images triggered but nothing found — ask which product instead of letting AI say "I can't"
    const noImgMsg = productKeywords.length > 0
      ? `Kaunse product ki image chahiye? Jaise "MAMO PLUS", "VG TONE", "INLYTE" etc. 😊`
      : `Hamare paas kai products hain! Kaunse category ki images chahiye?\n\n1️⃣ Breast Care\n2️⃣ Intimate Care\n3️⃣ Hair Care\n4️⃣ Skin / Face Care\n5️⃣ Slimming`;
    await sendWhatsAppText(ws.phone_number_id, ws.access_token, toPhone, noImgMsg);
    await saveOutboundMessage(supabase, conversationId, workspaceId, contactId, { type: 'text', content: noImgMsg });
    return;
  }
  // ── End Image/Payment Intent ──────────────────────────────────────────────────
  // \u2500\u2500 End Image Intent \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const message = isEscalation
    ? ESCALATION_REPLY
    : (await getAIReply(customerMessage, name, kbContext, imageUrl, wsSettings, businessName, conversationHistory, intentLabel)
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
      // Do NOT auto-pause bot after escalation — if no human agent is available,
      // customer would be left with zero replies. Human agents can manually
      // pause the bot from the dashboard when they take over.
      await (supabase as any).from('conversations').update(updatePayload).eq('id', conversationId);

      // Detect booking/callback events and log them (non-blocking)
      void detectAndLogEvent(
        supabase, workspaceId, conversationId, contactId,
        customerName, toPhone, customerMessage, message, wsSettings,
      );
    }
  } catch (error) {
    console.error('[AutoReply] Failed:', error);
  }
}

// ── Conversation Event Detection & Logging ────────────────────────────────────
type ConvEventType = 'demo_booked' | 'callback_requested' | 'appointment_set' | 'not_interested' | 'follow_up';

function detectConversationEvent(userMessage: string, botReply: string): ConvEventType | null {
  const user = userMessage.toLowerCase();
  const bot  = botReply.toLowerCase();

  // Callback: user explicitly asks for a human/call
  if (/\b(samajh nahi|call karo|call me|call back|callback|baat karni|agent|operator|human|speak to|connect me|mujhe samajh|nahi aaya|clear nahi|confused)\b/i.test(user)) {
    return 'callback_requested';
  }

  // Not interested
  if (/\b(not interested|nahi chahiye|remove|band karo|mat karo|no thanks|zaroorat nahi|interested nahi|nahi lena)\b/i.test(user)) {
    return 'not_interested';
  }

  // Follow up scheduled
  if (/\b(follow up|baad mein|next week|agle hafte|hafte baad|mahine baad|next month|2 week|2 hafte|3 hafte)\b/i.test(user)) {
    return 'follow_up';
  }

  // Demo/Appointment booked — bot confirms with date+time
  const hasDateInBot = /\b(\d{1,2}\s*(baje|am|pm|:00|:30)|kal|parso|aaj|monday|tuesday|wednesday|thursday|friday|saturday|sunday|somwar|mangal|budh|guru|shukra|shaniv|raviwar|\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i.test(bot);
  const hasConfirmInBot = /\b(confirm|book ho|schedule|visit|aayenge|milenge|appointment|aa jao|aa jayenge|kal aayenge|team aayegi|demo fix)\b/i.test(bot);

  if (hasDateInBot && hasConfirmInBot) {
    // Differentiate demo vs generic appointment
    if (/\b(demo|visit|office mein|office me|aapke paas|aapke office)\b/i.test(bot)) return 'demo_booked';
    return 'appointment_set';
  }

  return null;
}

function extractScheduledAt(botReply: string): string | null {
  // Try to extract a rough date/time for the Google Calendar event
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const dayAfter  = new Date(now); dayAfter.setDate(now.getDate() + 2);

  if (/\bkal\b|\btomorrow\b/i.test(botReply)) {
    const timeMatch = /(\d{1,2})\s*(baje|am|pm|:00|:30)/i.exec(botReply);
    const hour = timeMatch?.[1] ? parseInt(timeMatch[1]) : 11;
    tomorrow.setHours(hour < 8 ? hour + 12 : hour, 0, 0, 0);
    return tomorrow.toISOString();
  }
  if (/\bparso\b|\bday after\b/i.test(botReply)) {
    dayAfter.setHours(11, 0, 0, 0);
    return dayAfter.toISOString();
  }
  const timeMatch = /(\d{1,2})\s*(baje|am|pm)/i.exec(botReply);
  if (timeMatch?.[1] && timeMatch?.[2]) {
    const hour = parseInt(timeMatch[1]);
    const adjusted = /pm/i.test(timeMatch[2]) && hour < 12 ? hour + 12 : hour;
    now.setHours(adjusted, 0, 0, 0);
    return now.toISOString();
  }
  return null;
}

function extractLocation(botReply: string): string | null {
  // Look for city/area mentioned near "office" or "address"
  const m = /(?:office|address|location)[^.]*?(?:in|at|mein|me)\s+([A-Za-zऀ-ॿ\s,]+?)(?:\.|,|$)/i.exec(botReply);
  return m?.[1]?.trim() ?? null;
}

async function detectAndLogEvent(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string | undefined,
  contactId: string | undefined,
  contactName: string,
  contactPhone: string,
  userMessage: string,
  botReply: string,
  wsSettings: Record<string, unknown>,
): Promise<void> {
  try {
    const eventType = detectConversationEvent(userMessage, botReply);
    if (!eventType) return;

    const scheduledAt = extractScheduledAt(botReply);
    const location    = extractLocation(botReply);

    // Insert event record
    const db = supabase as any;
    const { data: inserted } = await db.from('conversation_events').insert({
      workspace_id:    workspaceId,
      conversation_id: conversationId ?? null,
      contact_id:      contactId ?? null,
      event_type:      eventType,
      contact_name:    contactName,
      contact_phone:   contactPhone,
      scheduled_at:    scheduledAt,
      location,
      notes:           botReply.slice(0, 500),
      status:          'pending',
    }).select('id').single();

    if (!inserted?.id) return;

    // Sync to Google Calendar if connected
    const refreshToken = wsSettings.google_calendar_refresh_token as string | undefined;
    const calendarId   = (wsSettings.google_calendar_id as string | undefined) ?? 'primary';

    if (refreshToken && (eventType === 'demo_booked' || eventType === 'appointment_set' || eventType === 'callback_requested')) {
      const { createCalendarEvent } = await import('@/lib/google-calendar');
      const start = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const end   = new Date(start.getTime() + 30 * 60 * 1000); // 30 min duration

      const title = eventType === 'demo_booked'
        ? `Demo Visit — ${contactName} (${contactPhone})`
        : eventType === 'callback_requested'
        ? `Callback — ${contactName} (${contactPhone})`
        : `Appointment — ${contactName} (${contactPhone})`;

      const gcalEventId = await createCalendarEvent(refreshToken, calendarId, {
        summary:       title,
        description:   `WhatsApp conversation\nCustomer: ${contactName}\nPhone: ${contactPhone}\n\nLast message:\n${botReply.slice(0, 300)}`,
        location:      location ?? undefined,
        startDateTime: start.toISOString(),
        endDateTime:   end.toISOString(),
      });

      if (gcalEventId) {
        await db.from('conversation_events').update({ google_event_id: gcalEventId }).eq('id', inserted.id);
      }
    }
  } catch (err) {
    console.error('[EventDetect]', err);
  }
}

// Regex to detect order reference in a message (e.g. "order 12345", "#ORD-001", "order no. ABC")
const ORDER_PATTERN = /(?:order|ord(?:er)?\s*(?:no\.?|#|id)?)\s*[:#]?\s*([A-Za-z0-9_-]{3,30})/i;

const STOP_WORDS  = ['stop', 'unsubscribe', 'cancel', 'quit', 'opt out', 'optout', 'remove me', 'end'];
const START_WORDS = ['start', 'subscribe', 'opt in', 'optin', 'resume'];

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
  // failed_at column not yet in DB schema — status='failed' is tracked via status field above

  const db = supabase as any;

  const { error } = await db
    .from('messages')
    .update(patch)
    .eq('whatsapp_msg_id', status.id);

  if (error) throw new Error(error.message);

  // Mirror status to campaign_recipients and sync aggregate counts on campaigns table.
  // IMPORTANT: Never overwrite 'replied' or 'filtered' — a late 'delivered'/'read' receipt
  // from Meta must not downgrade a record that already reached a terminal state.
  const { data: updatedCr } = await db
    .from('campaign_recipients')
    .update(patch)
    .eq('whatsapp_msg_id', status.id)
    .not('status', 'in', '(replied,filtered)')
    .select('campaign_id')
    .maybeSingle();

  if (updatedCr?.campaign_id && ['delivered', 'read', 'failed'].includes(status.status)) {
    // Re-aggregate via COUNT queries (bypasses Supabase's 1000-row default row limit).
    // sent_count is also re-calculated here so it stays in sync as messages progress
    // from 'sent' → 'delivered' (executor writes sent_count at completion time but
    // later delivery webhooks can push more rows into delivered without updating it).
    const cid = updatedCr.campaign_id;
    const [sentRes, deliveredRes, readRes, failedRes] = await Promise.all([
      db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).in('status', ['sent', 'delivered', 'read', 'replied']),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).in('status', ['delivered', 'read', 'replied']),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).in('status', ['read', 'replied']),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', cid).eq('status', 'failed'),
    ]);

    await db
      .from('campaigns')
      .update({
        sent_count:      sentRes.count      ?? 0,
        delivered_count: deliveredRes.count ?? 0,
        read_count:      readRes.count      ?? 0,
        failed_count:    failedRes.count    ?? 0,
      })
      .eq('id', cid);
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
    'button_reply',
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

// ── Shared helper: save an outbound bot message to DB ────────────────────────
// Fetch a media URL, convert WebP→JPEG via sharp, upload to WhatsApp Media API.
// Returns { mediaId, waType } to use in the messages payload, or null on failure.
// Supports: jpeg/png (image), webp→jpeg (image), mp4/3gp (video), others→document.
async function uploadMediaToWhatsApp(
  phoneNumberId: string,
  token: string,
  mediaUrl: string,
): Promise<{ mediaId: string; waType: 'image' | 'video' | 'document' } | null> {
  try {
    const resp = await fetch(mediaUrl);
    if (!resp.ok) { console.error('[uploadMedia] fetch failed:', resp.status, mediaUrl); return null; }
    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf) as Buffer<ArrayBuffer>;

    const lower = (mediaUrl.toLowerCase().split('?')[0] ?? '');
    let mimeType: string;
    let waType: 'image' | 'video' | 'document';
    let filename: string;
    let finalBuffer: Buffer<ArrayBuffer> = buffer;

    if (lower.endsWith('.webp') || lower.endsWith('.gif')) {
      // Convert WebP/GIF → JPEG using sharp (bundled with Next.js)
      const sharp = (await import('sharp')).default;
      const converted = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
      finalBuffer = Buffer.from(converted) as Buffer<ArrayBuffer>;
      mimeType = 'image/jpeg'; waType = 'image'; filename = 'image.jpg';
    } else if (lower.endsWith('.png')) {
      mimeType = 'image/png'; waType = 'image'; filename = 'image.png';
    } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      mimeType = 'image/jpeg'; waType = 'image'; filename = 'image.jpg';
    } else if (lower.endsWith('.mp4')) {
      mimeType = 'video/mp4'; waType = 'video'; filename = 'video.mp4';
    } else if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) {
      mimeType = 'video/3gpp'; waType = 'video'; filename = 'video.3gp';
    } else {
      // Unknown format — send as document
      const ext = lower.split('.').pop() ?? 'bin';
      mimeType = 'application/octet-stream'; waType = 'document'; filename = `file.${ext}`;
    }

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([finalBuffer], { type: mimeType }), filename);

    const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const uploadData = await uploadRes.json() as { id?: string; error?: { message: string } };
    if (uploadData.error) { console.error('[uploadMedia] WA error:', uploadData.error.message); return null; }
    if (!uploadData.id) return null;
    return { mediaId: uploadData.id, waType };
  } catch (e) {
    console.error('[uploadMedia] exception:', e);
    return null;
  }
}

async function saveOutboundMessage(
  supabase: AdminClient,
  conversationId: string | undefined,
  workspaceId: string,
  contactId: string | undefined,
  fields: { type: string; content: string; media_url?: string | null; whatsapp_msg_id?: string },
  createdAt?: string,
): Promise<void> {
  if (!conversationId) return;
  try {
    await (supabase as any).from('messages').insert({
      conversation_id: conversationId,
      workspace_id:    workspaceId,
      contact_id:      contactId ?? null,
      direction:       'outbound',
      sender_type:     'bot',
      type:            fields.type,
      content:         fields.content,
      media_url:       fields.media_url ?? null,
      whatsapp_msg_id: fields.whatsapp_msg_id ?? null,
      status:          'sent',
      created_at:      createdAt ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error('[saveOutboundMessage] failed:', err);
  }
}

// ── Payment Intent Detection ──────────────────────────────────────────────────
const PAYMENT_KEYWORDS = [
  'payment karna', 'payment kar', 'pay kar', 'bhugtan', 'paisa bhej',
  'payment bhej', 'upi', 'scanner', 'qr code', 'qr bhejo', 'scanner bhejo',
  'payment kaise', 'kaise pay', 'order karna hai', 'order confirm',
  'buy karna', 'purchase karna', 'khareedna', 'le lena', 'book karna',
  'payment details', 'account number', 'gpay', 'phonepe', 'paytm',
  'payment kru', 'payment krta', 'payment krdu', 'abhi pay',
];

function detectPaymentIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Image Intent Detection ────────────────────────────────────────────────────
// Require ≥2 words OR a specific phrase — single "Image" alone does NOT trigger.
const IMAGE_KEYWORDS_LIST = [
  'photo', 'photos', 'pic', 'pics', 'picture', 'pictures',
  'image', 'images', 'dikhao', 'dikha', 'dekho', 'dekhna',
  'show', 'catalog', 'catalogue', 'gallery', 'brochure',
  'product dikhao', 'products dikhao', 'image dikhao', 'image bhejo',
  'photo dikhao', 'photo bhejo', 'photo chahiye',
  'pic dikhao', 'pic bhejo', 'kya kya hai', 'all products', 'sab products',
];

// Known product name keywords — used to extract product context from message
const PRODUCT_NAME_KEYWORDS = [
  'mamo plus', 'mamo firm', 'b-reduce', 'breduce', 'nip-lyte', 'niplyte',
  'soft-nip', 'softnip', 'vg mist', 'vgmist', 'vg tone', 'vgtone',
  'vg-lyte', 'vglyte', 'vagilyte', 'inlyte', 'butt-shape', 'buttshape',
  'butt-lyte', 'buttlyte', 'acnezyl', 'fair-u', 'fairu', 'nurum plus',
  'neck-lyte', 'necklyte', 'eye-lyte', 'eyelyte', 'simlar', 'geluslim',
  'volumm', 'arula', 'rejuve', 'revital',
  'breast', 'mamo', 'nipple', 'vaginal', 'intimate', 'slimming', 'hair',
  'acne', 'neck', 'eye', 'stretch',
];

function detectImageIntent(message: string): true | null {
  const lower = message.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).filter((w) => w.length > 0).length;
  // Require at least 2 words OR a specific multi-word phrase — blocks single "Image" alone
  if (wordCount < 2) return null;
  return IMAGE_KEYWORDS_LIST.some((phrase) => lower.includes(phrase)) ? true : null;
}

// Extract product keywords from recent conversation history (last few bot messages)
function extractProductKeywords(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  customerMessage: string,
): string[] {
  const combined = [
    customerMessage,
    ...history.slice(-6).map((m) => m.content),
  ].join(' ').toLowerCase();

  const found = PRODUCT_NAME_KEYWORDS.filter((kw) => combined.includes(kw));
  return found.length > 0 ? found : [];
}

// Tags that identify payment/scanner images — never show these as product images
const PAYMENT_IMAGE_TAGS = ['scanner', 'payment', 'qr'];

async function searchMediaLibrary(
  supabase: AdminClient,
  workspaceId: string,
  keywords: string[],
  excludePaymentImages = true,
): Promise<Array<{ media_id: string; public_url: string | null; filename: string; media_type: string; tags?: string[] }>> {
  type MediaRow = { media_id: string; public_url: string | null; filename: string; media_type: string; tags?: string[] };
  // Helper to filter out scanner/payment images when searching for products
  const filterOut = (rows: MediaRow[] | null): MediaRow[] => {
    if (!excludePaymentImages || !rows) return rows ?? [];
    return rows.filter((r) => !PAYMENT_IMAGE_TAGS.some((pt) => (r.tags ?? []).includes(pt)));
  };

  try {
    // 1. Tag-based search (only works if images have tags set)
    if (keywords.length > 0) {
      const { data: tagResults } = await (supabase as any)
        .from('media_library')
        .select('media_id, public_url, filename, media_type, tags')
        .eq('workspace_id', workspaceId)
        .eq('media_type', 'image')
        .overlaps('tags', keywords)
        .order('created_at', { ascending: false })
        .limit(5);

      const filtered = filterOut(tagResults);
      if (filtered.length) return filtered;

      // 2. Filename keyword search (each keyword tried separately)
      for (const kw of keywords) {
        const { data: nameResults } = await (supabase as any)
          .from('media_library')
          .select('media_id, public_url, filename, media_type, tags')
          .eq('workspace_id', workspaceId)
          .eq('media_type', 'image')
          .ilike('filename', `%${kw}%`)
          .order('created_at', { ascending: false })
          .limit(3);

        const filteredName = filterOut(nameResults);
        if (filteredName.length) return filteredName;
      }
    }

    // 3. Final fallback: return all non-scanner images for this workspace (up to 5)
    const { data: allImages } = await (supabase as any)
      .from('media_library')
      .select('media_id, public_url, filename, media_type, tags')
      .eq('workspace_id', workspaceId)
      .eq('media_type', 'image')
      .order('created_at', { ascending: false })
      .limit(20);

    return filterOut(allImages).slice(0, 5);
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

// Strip AI artifacts that break WhatsApp UX — markdown, URLs, image references.
function sanitizeWhatsAppText(text: string): string {
  return text
    // Remove markdown image syntax: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    // Remove markdown link syntax: [text](url) → keep just the text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*\)/g, '$1')
    // Remove bare razorveda.in URLs
    .replace(/https?:\/\/(?:www\.)?razorveda\.in\S*/g, '')
    .replace(/(?:www\.)?razorveda\.in\S*/g, '')
    // Remove "Here's/Here is the image of [product]:" — image already sent before this text
    .replace(/^here[''']?s the image of[^:\n]*:?\s*$/gim, '')
    .replace(/^here is the image of[^:\n]*:?\s*$/gim, '')
    .replace(/^here[''']?s the image:?\s*$/gim, '')
    .replace(/^here is the image:?\s*$/gim, '')
    .replace(/^as you can see (in|from) the image[^:\n]*:?\s*$/gim, '')
    // Remove "please hold on / ek second / ruko" filler lines
    .replace(/^please hold on\.?\s*$/gim, '')
    .replace(/^ek second\.?\s*$/gim, '')
    .replace(/^just a (moment|second)\.?\s*$/gim, '')
    // Remove "I'm sending/bhej rahi hun" lines — images are sent before text, not "being sent"
    .replace(/^(i[''']?m |main )?(sending|bhej rahi? hun?|send kar rahi? hun?)[^.\n]*\.?\s*$/gim, '')
    // Remove "for images visit / for more info visit" lines
    .replace(/^for (images?|more info|details?) (visit|see|check)[^.\n]*\.?\s*$/gim, '')
    // Clean up extra blank lines left behind
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  text: string,
): Promise<void> {
  const token = accessToken.replace(/﻿/g, '').trim();
  const cleanText = sanitizeWhatsAppText(text);
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                toPhone,
      type:              'text',
      text:              { preview_url: false, body: cleanText },
    }),
  });
}
