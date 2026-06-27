import { createAdminClient } from '@/services/supabase/admin';

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  tags: string[];
}

interface Template {
  name: string;
  language: string;
  body: string;
  variables: string[];
}

interface Workspace {
  phone_number_id: string;
  access_token: string;
}

function buildVariables(template: Template, contact: Contact): string[] {
  return (template.variables ?? []).map((_: string, i: number) => {
    if (i === 0) return contact.name ?? contact.phone;
    if (i === 1) return contact.phone;
    return '';
  });
}

function sanitizePhone(phone: string): string {
  // Strip everything except digits and leading +, producing E.164 format
  return phone.replace(/[^\d+]/g, '');
}

// Wraps fetch with a 15-second timeout and 1 automatic retry on network failure.
// "TypeError: fetch failed" on Coolify is caused by connection drops to graph.facebook.com
// â€” timeout + retry recovers most transient failures without marking messages as failed.
async function metaFetch(url: string, init: RequestInit): Promise<Response> {
  const attempt = async () =>
    fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  try {
    return await attempt();
  } catch (e) {
    // One retry after a short pause for transient network errors
    await new Promise((r) => setTimeout(r, 1000));
    return await attempt();
  }
}

async function sendTemplateMessage(
  ws: Workspace,
  toPhone: string,
  templateName: string,
  language: string,
  variables: string[],
  headerMediaId?: string,    // WhatsApp media ID for IMAGE/VIDEO/DOCUMENT header
  headerMediaType?: string,  // image | video | document
  ltoExpiryMs?: number,      // LTO: expiration_time_ms
  ltoCouponCode?: string,    // LTO: coupon code for COPY_CODE button
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  const components: Array<Record<string, unknown>> = [];

  // LTO component (must come before body)
  if (ltoExpiryMs) {
    components.push({
      type: 'limited_time_offer',
      parameters: [{
        type: 'limited_time_offer',
        limited_time_offer: { expiration_time_ms: ltoExpiryMs, has_expiration: true },
      }],
    });
  }

  // Header media component (IMAGE/VIDEO/DOCUMENT)
  if (headerMediaId && headerMediaType) {
    const isUrl = headerMediaId.startsWith('http://') || headerMediaId.startsWith('https://');
    components.push({
      type: 'header',
      parameters: [{
        type: headerMediaType,
        [headerMediaType]: isUrl ? { link: headerMediaId } : { id: headerMediaId },
      }],
    });
  }

  if (variables.length > 0) {
    components.push({ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: v || ' ' })) });
  }

  // COPY_CODE button for LTO (index 0 of buttons)
  if (ltoCouponCode) {
    components.push({
      type: 'button', sub_type: 'copy_code', index: '0',
      parameters: [{ type: 'coupon_code', coupon_code: ltoCouponCode }],
    });
  }

  const res = await metaFetch(
    `https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/ï»¿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   toPhone,
        type: 'template',
        template: {
          name:     templateName,
          language: { code: language },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    },
  );

  const data = await res.json() as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };

  if (!res.ok) {
    return { success: false, error: data?.error?.message ?? 'WhatsApp API error' };
  }
  return { success: true, waMessageId: data?.messages?.[0]?.id };
}

async function sendMediaMessage(
  ws: Workspace,
  toPhone: string,
  mediaId: string,
  mediaType: string,
  caption?: string,
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  try {
    const mType = mediaType.toLowerCase(); // WhatsApp API requires lowercase ("image", not "IMAGE")
    const isUrl = mediaId.startsWith('http://') || mediaId.startsWith('https://');
    const mediaPayload: Record<string, string> = isUrl ? { link: mediaId } : { id: mediaId };
    if (caption?.trim() && mType !== 'document') mediaPayload.caption = caption.trim();
    const res = await metaFetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/ï»¿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: mType,
        [mType]: mediaPayload,
      }),
    });
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { success: false, error: data?.error?.message ?? 'WhatsApp API error' };
    return { success: true, waMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    console.error(`[Campaign] Media send failed â†’ ${toPhone}:`, err);
    return { success: false, error: String(err) };
  }
}

// Sends a location pin (session-only â€” contact must have active 24h window)
async function sendLocationMessage(
  ws: Workspace,
  toPhone: string,
  lat: number,
  lng: number,
  name?: string,
  address?: string,
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  try {
    const res = await metaFetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/ï»¿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'location',
        location: { latitude: lat, longitude: lng, name: name ?? '', address: address ?? '' },
      }),
    });
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { success: false, error: data?.error?.message ?? 'WhatsApp API error' };
    return { success: true, waMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Sends a plain text / link message (session contacts only)
async function sendTextMessage(
  ws: Workspace,
  toPhone: string,
  text: string,
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  try {
    const res = await metaFetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/ï»¿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                toPhone,
        type:              'text',
        text:              { body: text, preview_url: true },
      }),
    });
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { success: false, error: data?.error?.message ?? 'WhatsApp API error' };
    return { success: true, waMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Sends an interactive list message (session-only)
async function sendInteractiveListMessage(
  ws: Workspace,
  toPhone: string,
  body: string,
  buttonText: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description: string }> }>,
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  try {
    const res = await metaFetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/ï»¿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: body },
          action: {
            button: buttonText || 'Select',
            sections: sections.map((s) => ({
              title: s.title,
              rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description || undefined })),
            })),
          },
        },
      }),
    });
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { success: false, error: data?.error?.message ?? 'WhatsApp API error' };
    return { success: true, waMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Sends a carousel template message
async function sendCarouselTemplateMessage(
  ws: Workspace,
  toPhone: string,
  templateName: string,
  language: string,
  cards: Array<{ body: string; header_type: string; buttons: Array<{ type: string; text: string; value?: string }> }>,
  cardMediaUrls: string[],
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  const carouselCards = cards.map((card, idx) => {
    const cardComponents: Array<Record<string, unknown>> = [];

    // Card header (image or video)
    if (card.header_type !== 'NONE' && cardMediaUrls[idx]) {
      const mediaType = card.header_type.toLowerCase();
      cardComponents.push({
        type: 'header',
        parameters: [{ type: mediaType, [mediaType]: { link: cardMediaUrls[idx] } }],
      });
    }

    // Card body variables (extract {{1}}, {{2}}...)
    const vars = (card.body.match(/\{\{(\d+)\}\}/g) ?? []).map((_, i) => `Variable ${i + 1}`);
    if (vars.length > 0) {
      cardComponents.push({ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: v })) });
    }

    // Card buttons
    card.buttons.forEach((btn, bi) => {
      if (btn.type === 'QUICK_REPLY') {
        cardComponents.push({
          type: 'button', sub_type: 'quick_reply', index: String(bi),
          parameters: [{ type: 'payload', payload: btn.text }],
        });
      } else if (btn.type === 'URL') {
        cardComponents.push({
          type: 'button', sub_type: 'url', index: String(bi),
          parameters: [{ type: 'text', text: btn.value || btn.text }],
        });
      }
    });

    return { card_index: idx, components: cardComponents };
  });

  try {
    const res = await metaFetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/ï»¿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: [{ type: 'carousel', cards: carouselCards }],
        },
      }),
    });
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { success: false, error: data?.error?.message ?? 'WhatsApp API error' };
    return { success: true, waMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Detects Meta API errors that mean the number is not registered on WhatsApp.
// These go to 'failed' (API rejected) and get cached in contacts.whatsapp_valid.
function isNotWhatsAppError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('131026') ||
    m.includes('not a valid whatsapp') ||
    m.includes('does not have a whatsapp') ||
    m.includes('not registered on whatsapp') ||
    m.includes('unknown contact') ||
    m.includes('recipient not found') ||
    m.includes('phone number is not valid')
  );
}

export interface CampaignRunResult {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  filtered: number;
  skipped?: string;
}

export async function executeCampaign(campaignId: string): Promise<CampaignRunResult> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: campaign, error: campError } = await db
    .from('campaigns')
    .select(`
      *,
      templates(
        name, language, body, variables, header_type, header_content,
        has_lto, is_carousel, cards, list_button_text, list_sections
      )
    `)
    .eq('id', campaignId)
    .single();

  if (campError || !campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (campaign.status === 'completed') return { campaignId, total: 0, sent: 0, failed: 0, filtered: 0, skipped: 'already completed' };

  const template = campaign.templates as (Template & {
    header_type?: string; header_content?: string;
    has_lto?: boolean; is_carousel?: boolean;
    cards?: Array<{ body: string; header_type: string; buttons: Array<{ type: string; text: string; value?: string }> }>;
    list_button_text?: string; list_sections?: unknown;
  }) | null;

  const isLocationCampaign = campaign.media_type === 'location';
  const isTextCampaign     = campaign.media_type === 'text';

  // Require at least template OR media OR location OR text content
  if (!template && !campaign.media_id && !isLocationCampaign && !isTextCampaign) throw new Error(`Campaign ${campaignId} has no template, media, or text content`);

  const { data: workspace } = await db
    .from('workspaces')
    .select('phone_number_id, access_token, waba_id')
    .eq('id', campaign.workspace_id)
    .single();

  const phoneNumberId = workspace?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = workspace?.access_token    ?? process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId        = workspace?.waba_id         ?? process.env.WHATSAPP_WABA_ID;

  if (!phoneNumberId || !accessToken) throw new Error('Missing WhatsApp credentials');

  const ws: Workspace = { phone_number_id: phoneNumberId, access_token: accessToken };

  // Pre-flight: verify template exists in Meta before starting the campaign.
  // Catches misconfigurations (template not submitted, wrong WABA) before wasting send quota.
  if (template && wabaId) {
    const cleanToken = accessToken.replace(/ï»¿/g, '').trim();
    const verifyUrl  = `https://graph.facebook.com/v19.0/${wabaId}/message_templates` +
      `?name=${encodeURIComponent(template.name)}&fields=name,status,language&access_token=${cleanToken}`;
    try {
      const verifyRes  = await fetch(verifyUrl);
      const verifyData = await verifyRes.json() as { data?: Array<{ name: string; status: string; language: string }> };
      const match = (verifyData.data ?? []).find(
        (t) => t.name === template.name && t.language === (template.language ?? 'en') && t.status === 'APPROVED',
      );
      if (!match) {
        const statusFound = (verifyData.data ?? []).find((t) => t.name === template.name);
        const reason = statusFound
          ? `Template "${template.name}" exists in Meta but status is "${statusFound.status}" (not APPROVED)`
          : `Template "${template.name}" (language: ${template.language ?? 'en'}) not found in this workspace's Meta account. Submit and get it approved first.`;
        await db.from('campaigns').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', campaignId);
        return { campaignId, total: 0, sent: 0, failed: 0, filtered: 0, skipped: reason };
      }
    } catch (_err) {
      // Non-fatal: if the verify call itself fails (network error etc.), proceed anyway
      console.warn('[Campaign] Template pre-flight check failed (non-fatal):', _err);
    }
  }

  let recipients: Contact[] = [];

  if (campaign.audience_type === 'contacts' && Array.isArray(campaign.audience_filter?.contact_ids) && campaign.audience_filter.contact_ids.length > 0) {
    // Specific contacts â€” batch the .in() queries to avoid URL length limit (PostgREST GET max ~8KB)
    const allIds = campaign.audience_filter.contact_ids as string[];
    const ID_BATCH = 400;
    for (let b = 0; b < allIds.length; b += ID_BATCH) {
      const { data } = await db
        .from('contacts')
        .select('id, phone, name, tags')
        .eq('workspace_id', campaign.workspace_id)
        .eq('is_blocked', false)
        .eq('opted_out', false)
        .in('id', allIds.slice(b, b + ID_BATCH)) as { data: Contact[] | null };
      recipients.push(...(data ?? []));
    }
  } else if (campaign.audience_type === 'manual' && Array.isArray(campaign.audience_filter?.phones) && campaign.audience_filter.phones.length > 0) {
    // Manually entered phone numbers â€” look up in contacts first, fall back to bare phone
    const rawPhones = (campaign.audience_filter.phones as string[]).map(sanitizePhone).filter(Boolean);
    const { data: found } = await db
      .from('contacts')
      .select('id, phone, name, tags')
      .eq('workspace_id', campaign.workspace_id)
      .in('phone', rawPhones) as { data: Contact[] | null };
    const foundMap = new Map((found ?? []).map((c: Contact) => [c.phone, c]));
    recipients = rawPhones.map((phone) => foundMap.get(phone) ?? { id: `manual-${phone}`, phone, name: null, tags: [] });
  } else {
    let contactQuery = db
      .from('contacts')
      .select('id, phone, name, tags')
      .eq('workspace_id', campaign.workspace_id)
      .eq('is_blocked', false)
      .eq('opted_out', false);

    if (campaign.audience_type === 'tag' && campaign.audience_filter?.tag) {
      contactQuery = contactQuery.contains('tags', [campaign.audience_filter.tag]);
    } else if (campaign.audience_type === 'tags' && Array.isArray(campaign.audience_filter?.tags) && campaign.audience_filter.tags.length > 0) {
      const tagFilters = (campaign.audience_filter.tags as string[])
        .map((t: string) => `tags.cs.{"${t}"}`)
        .join(',');
      contactQuery = contactQuery.or(tagFilters);
    } else if (campaign.audience_type === 'phone_prefix' && campaign.audience_filter?.prefix) {
      contactQuery = contactQuery.ilike('phone', `${campaign.audience_filter.prefix}%`);
    }

    // Paginate: PostgREST returns max 1000 rows by default â€” loop until all fetched
    const CONTACT_PAGE = 1000;
    let pageOffset = 0;
    while (true) {
      const { data: page } = await contactQuery.range(pageOffset, pageOffset + CONTACT_PAGE - 1) as { data: Contact[] | null };
      if (!page || page.length === 0) break;
      recipients.push(...page);
      if (page.length < CONTACT_PAGE) break;
      pageOffset += CONTACT_PAGE;
    }
  }

  if (recipients.length === 0) {
    await db.from('campaigns').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', campaignId);
    return { campaignId, total: 0, sent: 0, failed: 0, filtered: 0, skipped: 'no contacts' };
  }

  // Dedup protection: skip contacts already sent to in a previous (interrupted) run
  // Prevents double-charging if a cron times out mid-campaign and retries
  // Paginate to bypass Supabase's 1000-row default SELECT limit
  const sentPhones = new Set<string>();
  {
    let dedupOffset = 0;
    const DEDUP_PAGE = 1000;
    while (true) {
      const { data: page } = await db
        .from('campaign_recipients')
        .select('phone')
        .eq('campaign_id', campaignId)
        .in('status', ['sent', 'delivered', 'read', 'replied', 'filtered'])
        .range(dedupOffset, dedupOffset + DEDUP_PAGE - 1) as { data: Array<{ phone: string }> | null };
      if (!page || page.length === 0) break;
      page.forEach((r) => sentPhones.add(r.phone));
      if (page.length < DEDUP_PAGE) break;
      dedupOffset += DEDUP_PAGE;
    }
  }
  if (sentPhones.size > 0) {
    const before = recipients.length;
    recipients = recipients.filter((c) => !sentPhones.has(c.phone));
    console.log(`[Campaign ${campaignId}] Dedup: skipping ${before - recipients.length} already-sent contacts`);
  }

  if (recipients.length === 0) {
    await db.from('campaigns').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', campaignId);
    return { campaignId, total: 0, sent: 0, failed: 0, filtered: 0, skipped: 'all already sent' };
  }

  // â”€â”€ Pre-flight filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Run BEFORE setting status=running so total_recipients includes filtered contacts.
  const audienceSize = recipients.length;
  let filteredCount = 0;

  {
    const allPhones = recipients.map((c) => sanitizePhone(c.phone)).filter(Boolean);
    const BATCH = 400;
    const cacheExpiry = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Filter 1: WhatsApp validation cache (contacts.whatsapp_valid=false, checked within 7 days)
    const cachedInvalidPhones = new Set<string>();
    for (let i = 0; i < allPhones.length; i += BATCH) {
      const { data } = await db
        .from('contacts')
        .select('phone')
        .eq('workspace_id', campaign.workspace_id)
        .eq('whatsapp_valid', false)
        .gt('whatsapp_checked_at', cacheExpiry)
        .in('phone', allPhones.slice(i, i + BATCH)) as { data: Array<{ phone: string }> | null };
      for (const c of data ?? []) cachedInvalidPhones.add(c.phone);
    }

    // Filter 2: Engagement filter â€” phones that have had API-rejected sends in 2+ previous campaigns
    const repeatFailPhones = new Set<string>();
    for (let i = 0; i < allPhones.length; i += BATCH) {
      const { data } = await db
        .from('campaign_recipients')
        .select('phone, campaign_id')
        .eq('workspace_id', campaign.workspace_id)
        .neq('campaign_id', campaignId)
        .eq('status', 'failed')
        .in('phone', allPhones.slice(i, i + BATCH)) as { data: Array<{ phone: string; campaign_id: string }> | null };
      const campaignMap = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        if (!campaignMap.has(row.phone)) campaignMap.set(row.phone, new Set());
        campaignMap.get(row.phone)!.add(row.campaign_id);
      }
      for (const [phone, camps] of campaignMap) {
        if (camps.size >= 2) repeatFailPhones.add(phone);
      }
    }

    // Partition: filtered out vs to-send
    const filteredRows: Array<Record<string, unknown>> = [];
    const toSend: Contact[] = [];
    for (const contact of recipients) {
      const phone = sanitizePhone(contact.phone);
      const realId = contact.id && !contact.id.startsWith('manual-') ? contact.id : null;
      const base = {
        campaign_id: campaignId, workspace_id: campaign.workspace_id,
        contact_id: realId, phone: contact.phone, name: contact.name ?? null,
        status: 'filtered', sent_at: new Date().toISOString(),
      };
      if (cachedInvalidPhones.has(phone)) {
        filteredRows.push({ ...base, filtered_reason: 'no_whatsapp' });
      } else if (repeatFailPhones.has(phone)) {
        filteredRows.push({ ...base, filtered_reason: 'repeat_campaign_fail' });
      } else {
        toSend.push(contact);
      }
    }

    // Bulk-insert filtered records
    if (filteredRows.length > 0) {
      const FLUSH = 200;
      for (let i = 0; i < filteredRows.length; i += FLUSH) {
        await db.from('campaign_recipients').insert(filteredRows.slice(i, i + FLUSH));
      }
      filteredCount = filteredRows.length;
      recipients = toSend;
      console.log(`[Campaign ${campaignId}] Pre-flight: filtered ${filteredCount} (${cachedInvalidPhones.size} no-WA, ${repeatFailPhones.size} repeat-fail)`);
    }
  }
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  await db.from('campaigns').update({
    status: 'running', started_at: new Date().toISOString(),
    total_recipients: audienceSize,   // full audience including filtered
    filtered_count: filteredCount,
  }).eq('id', campaignId);

  let sentCount = 0;
  let failedCount = 0;

  // Send in parallel batches for speed:
  // - BATCH_SIZE messages fire concurrently
  // - BATCH_DELAY ms gap between batches controls throughput
  // - DB inserts are batched every DB_FLUSH_SIZE contacts
  // Target: 15 parallel Ã— 1 batch/200ms = ~4500 msgs/min
  const BATCH_SIZE    = 5;    // reduced: fewer concurrent connections = fewer "fetch failed" drops
  const BATCH_DELAY   = 300;  // ms between batches
  const DB_FLUSH_SIZE = 25;

  const pendingRecipients: Array<Record<string, unknown>> = [];

  const flushRecipients = async () => {
    if (pendingRecipients.length === 0) return;
    const rows = pendingRecipients.splice(0, pendingRecipients.length);

    // Try batch insert first
    const { error: batchErr } = await db.from('campaign_recipients').insert(rows);

    if (batchErr) {
      // Batch failed â€” fall back to one-by-one so bad rows don't block good ones
      console.error(`[Campaign] Batch insert failed (${batchErr.code}): ${batchErr.message}. Retrying row-by-row.`);
      let rowErrors = 0;
      for (const row of rows) {
        const { error: rowErr } = await db.from('campaign_recipients').insert(row);
        if (rowErr) {
          console.error(`[Campaign] Row insert failed for phone ${row.phone}: ${rowErr.message}`);
          rowErrors++;
        }
      }
      if (rowErrors === rows.length) {
        // Every single row failed â€” surface the original batch error so cron response shows it
        throw new Error(`campaign_recipients insert failed (all ${rows.length} rows): ${batchErr.message} | code:${batchErr.code} | hint:${batchErr.hint}`);
      }
    }

    await db.from('campaigns').update({ sent_count: sentCount, failed_count: failedCount, filtered_count: filteredCount }).eq('id', campaignId);
  };

  // Prepare send parameters
  const tmplHeaderType = template?.header_type?.toUpperCase();
  const isMediaHeader  = tmplHeaderType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tmplHeaderType);
  const headerMediaId  = isMediaHeader ? (campaign.media_id as string | undefined ?? undefined) : undefined;
  const headerMediaType = headerMediaId ? (tmplHeaderType?.toLowerCase() ?? undefined) : undefined;

  // Early-fail: template requires media but campaign has none → fail immediately with a clear reason
  if (isMediaHeader && !headerMediaId) {
    await db.from('campaigns').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', campaignId);
    return { campaignId, total: 0, sent: 0, failed: 0, filtered: 0, skipped: `Template "${template?.name}" requires a ${tmplHeaderType?.toLowerCase()} header but no media was provided for this campaign. Upload an image and retry.` };
  }

  // LTO params
  const ltoExpiryMs   = campaign.lto_expiry_at ? new Date(campaign.lto_expiry_at).getTime() : undefined;
  const ltoCouponCode = (campaign.lto_coupon_code as string | undefined) ?? undefined;

  // Carousel params
  const isCarousel     = !!(template?.is_carousel && Array.isArray(template?.cards) && template.cards.length > 0);
  const carouselCards  = (template?.cards ?? []) as Array<{ body: string; header_type: string; buttons: Array<{ type: string; text: string; value?: string }> }>;
  const cardMediaUrls  = (campaign.card_media_urls as string[] | null) ?? [];

  // Location params
  const locationLat  = campaign.location_lat  as number | null;
  const locationLng  = campaign.location_lng  as number | null;
  const locationName = campaign.location_name as string | null;
  const locationAddr = campaign.location_address as string | null;

  // Interactive list params
  const isListTemplate  = !!(template?.list_sections && !isCarousel);
  const listButtonText  = (template?.list_button_text as string | undefined) ?? 'Select';
  const listSections    = (template?.list_sections as Array<{ title: string; rows: Array<{ id: string; title: string; description: string }> }> | null) ?? [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (contact) => {
        try {
          // Text / link campaign
          if (isTextCampaign) {
            const textBody = (campaign as any).text_content as string | undefined;
            if (!textBody?.trim()) throw new Error('Text campaign has no text_content');
            const result = await sendTextMessage(ws, sanitizePhone(contact.phone), textBody);
            return { contact, result, msgContent: textBody, msgType: 'text' };
          }
          // Location campaign
          if (isLocationCampaign && locationLat !== null && locationLng !== null) {
            const result = await sendLocationMessage(ws, sanitizePhone(contact.phone), locationLat, locationLng, locationName ?? undefined, locationAddr ?? undefined);
            return { contact, result, msgContent: '[location]', msgType: 'location' };
          }
          // Carousel template
          if (isCarousel && template) {
            const result = await sendCarouselTemplateMessage(ws, sanitizePhone(contact.phone), template.name, template.language ?? 'en', carouselCards, cardMediaUrls);
            return { contact, result, msgContent: '[carousel]', msgType: 'template' as const };
          }
          // Interactive list template
          if (isListTemplate && template) {
            const listBody = template.body || 'Choose an option';
            const result = await sendInteractiveListMessage(ws, sanitizePhone(contact.phone), listBody, listButtonText, listSections);
            return { contact, result, msgContent: listBody, msgType: 'interactive' };
          }
          // Standard template (with optional LTO)
          if (template) {
            const variables = buildVariables(template, contact);
            const result = await sendTemplateMessage(
              ws, sanitizePhone(contact.phone), template.name, template.language ?? 'en',
              variables, headerMediaId, headerMediaType,
              template.has_lto ? ltoExpiryMs : undefined,
              template.has_lto ? ltoCouponCode : undefined,
            );
            return { contact, result, msgContent: template.body, msgType: 'template' as const };
          }
          // Media-only (image/video/document/audio)
          const result = await sendMediaMessage(ws, sanitizePhone(contact.phone), campaign.media_id as string, campaign.media_type as string, (campaign as any).media_caption ?? undefined)
            .catch((e: unknown) => ({ success: false, error: String(e) }));
          return { contact, result, msgContent: `[${campaign.media_type}]`, msgType: campaign.media_type as string ?? 'image' };
        } catch (e) {
          return { contact, result: { success: false, error: String(e) }, msgContent: '', msgType: 'template' as const };
        }
      }),
    );

    // Collect results into pending batch for DB
    for (const settled of results) {
      if (settled.status === 'rejected') {
        // Promise itself rejected (should not happen â€” inner fn catches errors)
        // failedCount incremented but no contact info available to track
        failedCount++;
        continue;
      }
      const { contact, result } = settled.value;
      const realContactId = contact.id && !contact.id.startsWith('manual-') ? contact.id : null;
      if (result.success) {
        sentCount++;
        pendingRecipients.push({
          campaign_id:     campaignId,
          workspace_id:    campaign.workspace_id,
          contact_id:      realContactId,
          phone:           contact.phone,
          name:            contact.name ?? null,
          status:          'sent',
          whatsapp_msg_id: ('waMessageId' in result ? result.waMessageId : undefined) ?? null,
          sent_at:         new Date().toISOString(),
        });
      } else {
        failedCount++;
        console.error(`[Campaign ${campaignId}] Failed â†’ ${contact.phone}:`, result.error);
        pendingRecipients.push({
          campaign_id:   campaignId,
          workspace_id:  campaign.workspace_id,
          contact_id:    realContactId,
          phone:         contact.phone,
          name:          contact.name ?? null,
          status:        'failed',
          error_message: result.error ?? 'WhatsApp API error',
          sent_at:       new Date().toISOString(),
        });
        // Cache as invalid WhatsApp number if Meta API says so â€” skip next campaign
        if (result.error && isNotWhatsAppError(result.error)) {
          void db.from('contacts')
            .update({ whatsapp_valid: false, whatsapp_checked_at: new Date().toISOString() })
            .eq('workspace_id', campaign.workspace_id)
            .eq('phone', contact.phone);
        }
      }
    }

    // Flush to DB every DB_FLUSH_SIZE contacts or at end
    if (pendingRecipients.length >= DB_FLUSH_SIZE || i + BATCH_SIZE >= recipients.length) {
      await flushRecipients();
    }

    // Pace between batches (avoids Meta rate limit)
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  // Final flush in case anything remains
  await flushRecipients();

  // â”€â”€ Create conversations + save outbound campaign messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Campaign executor never wrote to messages table, so conversations appeared
  // empty in the platform. We batch-create them here after the send loop.
  try {
    // For text campaigns, content is in text_content; for template campaigns it's in template.body
    const templateBody: string = (campaign as any).text_content ?? (template as any)?.body ?? `[Campaign: ${campaign.name ?? campaignId}]`;

    // Re-fetch successfully sent recipients to get contact_id + phone + whatsapp_msg_id
    const { data: sentRows } = await db
      .from('campaign_recipients')
      .select('contact_id, phone, whatsapp_msg_id, sent_at')
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')
      .not('contact_id', 'is', null)
      .limit(5000);

    if (sentRows && sentRows.length > 0) {
      // Batch upsert conversations (50 at a time)
      const CONV_BATCH = 50;
      for (let ci = 0; ci < sentRows.length; ci += CONV_BATCH) {
        const batch = sentRows.slice(ci, ci + CONV_BATCH);
        const convRows = batch.map((r: { contact_id: string; phone: string; sent_at: string }) => ({
          workspace_id:     campaign.workspace_id,
          contact_id:       r.contact_id,
          status:           'open',
          channel:          'whatsapp',
          last_message:     templateBody.slice(0, 200),
          last_message_at:  r.sent_at ?? new Date().toISOString(),
        }));

        const { data: upserted } = await db
          .from('conversations')
          .upsert(convRows, { onConflict: 'workspace_id,contact_id', ignoreDuplicates: false })
          .select('id, contact_id');

        if (!upserted?.length) continue;

        // Map contact_id â†’ { conversation_id, sent_at, whatsapp_msg_id }
        const crMap = new Map(batch.map((r: { contact_id: string; phone: string; sent_at: string; whatsapp_msg_id: string | null }) => [r.contact_id, r]));

        // Insert outbound campaign messages
        const msgRows = upserted
          .map((conv: { id: string; contact_id: string }) => {
            const cr = crMap.get(conv.contact_id) as { contact_id: string; sent_at: string; whatsapp_msg_id: string | null } | undefined;
            if (!cr) return null;
            return {
              conversation_id: conv.id,
              workspace_id:    campaign.workspace_id,
              sender_id:       null,
              direction:       'outbound',
              sender_type:     'campaign',
              type:            'text',
              content:         templateBody,
              whatsapp_msg_id: cr.whatsapp_msg_id ?? null,
              status:          'sent',
              created_at:      cr.sent_at ?? new Date().toISOString(),
            };
          })
          .filter(Boolean);

        if (msgRows.length > 0) {
          // Rows with a whatsapp_msg_id: use upsert to skip duplicates (unique index on whatsapp_msg_id)
          const withId  = msgRows.filter((r: Record<string, unknown>) => r.whatsapp_msg_id);
          const withoutId = msgRows.filter((r: Record<string, unknown>) => !r.whatsapp_msg_id);
          if (withId.length)    await db.from('messages').upsert(withId,    { onConflict: 'whatsapp_msg_id', ignoreDuplicates: true });
          if (withoutId.length) await db.from('messages').insert(withoutId);
        }

        // Update campaign_recipients with conversation_id
        for (const conv of upserted) {
          void db.from('campaign_recipients')
            .update({ conversation_id: conv.id })
            .eq('campaign_id', campaignId)
            .eq('contact_id', conv.contact_id);
        }
      }
      console.log(`[Campaign ${campaignId}] Created/updated conversations for ${sentRows.length} sent contacts`);
    }
  } catch (e) {
    console.error(`[Campaign ${campaignId}] Failed to create conversations:`, e);
  }
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  await db.from('campaigns').update({
    status: 'completed', completed_at: new Date().toISOString(),
    sent_count: sentCount, failed_count: failedCount, filtered_count: filteredCount,
  }).eq('id', campaignId);

  // ── Post-completion reply sync ────────────────────────────────────────────────
  // Some inbound messages (especially instant auto-replies from business numbers)
  // arrive before the campaign_recipients row is committed to DB due to batch timing.
  // This pass runs after completion to retroactively link any missed replies.
  void (async () => {
    try {
      const campStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h
      // Get all non-replied recipients for this campaign
      const allNotReplied: Array<{ id: string; phone: string }> = [];
      let syncOffset = 0;
      while (true) {
        const { data: page } = await db.from('campaign_recipients')
          .select('id, phone')
          .eq('campaign_id', campaignId)
          .not('status', 'in', '(replied,filtered,failed)')
          .range(syncOffset, syncOffset + 999);
        if (!page?.length) break;
        allNotReplied.push(...page);
        if (page.length < 1000) break;
        syncOffset += 1000;
      }
      if (!allNotReplied.length) return;

      const ws2 = await db.from('workspaces').select('id').eq('id', campaign.workspace_id).single();
      const wid = ws2?.data?.id ?? campaign.workspace_id;

      // Check inbound messages for each phone
      const SYNC_BATCH = 200;
      let syncUpdated = 0;
      for (let si = 0; si < allNotReplied.length; si += SYNC_BATCH) {
        const batch = allNotReplied.slice(si, si + SYNC_BATCH);
        const phones = batch.map((r) => r.phone);

        const { data: ctcts } = await db.from('contacts').select('id, phone').eq('workspace_id', wid).in('phone', phones);
        if (!ctcts?.length) continue;

        const ctctIds = ctcts.map((c: { id: string }) => c.id);
        const { data: convs2 } = await db.from('conversations').select('id, contact_id').eq('workspace_id', wid).in('contact_id', ctctIds);
        if (!convs2?.length) continue;

        const convIds2 = convs2.map((c: { id: string }) => c.id);
        const phoneMap2 = new Map(ctcts.map((c: { id: string; phone: string }) => [c.id, c.phone]));

        const { data: msgs2 } = await db.from('messages')
          .select('conversation_id, content, type, created_at, metadata')
          .eq('workspace_id', wid)
          .eq('direction', 'inbound')
          .gte('created_at', campStart)
          .in('conversation_id', convIds2)
          .order('created_at', { ascending: true });
        if (!msgs2?.length) continue;

        const firstMsgMap = new Map<string, typeof msgs2[0]>();
        for (const m of msgs2) {
          if (!firstMsgMap.has(m.conversation_id)) firstMsgMap.set(m.conversation_id, m);
        }

        for (const [convId2, m] of firstMsgMap) {
          const conv2 = convs2.find((c: { id: string }) => c.id === convId2);
          if (!conv2) continue;
          const phone2 = phoneMap2.get(conv2.contact_id);
          if (!phone2) continue;
          const cr2 = batch.find((r) => r.phone === phone2);
          if (!cr2) continue;

          const isBtn = m.type === 'text' && m.metadata?.button_reply;
          await db.from('campaign_recipients').update({
            status: 'replied',
            replied_at: m.created_at,
            reply_type: isBtn ? 'button' : 'text',
            reply_text: (isBtn ? m.metadata.button_reply.text : m.content)?.slice(0, 500) ?? null,
            conversation_id: convId2,
          }).eq('id', cr2.id);
          syncUpdated++;
        }
      }

      if (syncUpdated > 0) {
        const { count: finalReplied } = await db.from('campaign_recipients')
          .select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'replied');
        await db.from('campaigns').update({ replied_count: finalReplied ?? 0 }).eq('id', campaignId);
        console.log(`[Campaign ${campaignId}] Post-sync: +${syncUpdated} replies linked, total=${finalReplied}`);
      }
    } catch (e) {
      console.error(`[Campaign ${campaignId}] Post-completion reply sync failed:`, e);
    }
  })();

  return { campaignId, total: audienceSize, sent: sentCount, failed: failedCount, filtered: filteredCount };
}
