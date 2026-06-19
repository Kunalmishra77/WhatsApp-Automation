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

async function sendTemplateMessage(
  ws: Workspace,
  toPhone: string,
  templateName: string,
  language: string,
  variables: string[],
  headerMediaId?: string,    // WhatsApp media ID for IMAGE/VIDEO/DOCUMENT header
  headerMediaType?: string,  // image | video | document
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  const components: Array<Record<string, unknown>> = [];

  // Include header media component when template has IMAGE/VIDEO/DOCUMENT header
  // Supports both WhatsApp media ID ({ id }) and public URL ({ link })
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

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/﻿/g, '').trim()}`,
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
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ws.access_token.replace(/﻿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: mediaType,
        [mediaType]: { id: mediaId },
      }),
    });
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { success: false, error: data?.error?.message ?? 'WhatsApp API error' };
    return { success: true, waMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    console.error(`[Campaign] Media send failed → ${toPhone}:`, err);
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
    .select('*, templates(name, language, body, variables, header_type, header_content)')
    .eq('id', campaignId)
    .single();

  if (campError || !campaign) throw new Error(`Campaign ${campaignId} not found`);

  if (campaign.status === 'completed') return { campaignId, total: 0, sent: 0, failed: 0, filtered: 0, skipped: 'already completed' };

  const template = campaign.templates as (Template & { header_type?: string; header_content?: string }) | null;

  // Require at least template OR media — can't run an empty campaign
  if (!template && !campaign.media_id) throw new Error(`Campaign ${campaignId} has no template or media`);

  const { data: workspace } = await db
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', campaign.workspace_id)
    .single();

  const phoneNumberId = workspace?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = workspace?.access_token    ?? process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) throw new Error('Missing WhatsApp credentials');

  const ws: Workspace = { phone_number_id: phoneNumberId, access_token: accessToken };

  let recipients: Contact[] = [];

  if (campaign.audience_type === 'contacts' && Array.isArray(campaign.audience_filter?.contact_ids) && campaign.audience_filter.contact_ids.length > 0) {
    // Specific contacts — batch the .in() queries to avoid URL length limit (PostgREST GET max ~8KB)
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
    // Manually entered phone numbers — look up in contacts first, fall back to bare phone
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

    // Paginate: PostgREST returns max 1000 rows by default — loop until all fetched
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
        .in('status', ['sent', 'delivered', 'read', 'replied'])
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

  // ── Pre-flight filters ────────────────────────────────────────────────────
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

    // Filter 2: Engagement filter — phones that have had API-rejected sends in 2+ previous campaigns
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
  // ─────────────────────────────────────────────────────────────────────────

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
  // Target: 15 parallel × 1 batch/200ms = ~4500 msgs/min
  const BATCH_SIZE    = 15;
  const BATCH_DELAY   = 200;   // ms between batches
  const DB_FLUSH_SIZE = 25;

  const pendingRecipients: Array<Record<string, unknown>> = [];

  const flushRecipients = async () => {
    if (pendingRecipients.length === 0) return;
    const rows = pendingRecipients.splice(0, pendingRecipients.length);

    // Try batch insert first
    const { error: batchErr } = await db.from('campaign_recipients').insert(rows);

    if (batchErr) {
      // Batch failed — fall back to one-by-one so bad rows don't block good ones
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
        // Every single row failed — surface the original batch error so cron response shows it
        throw new Error(`campaign_recipients insert failed (all ${rows.length} rows): ${batchErr.message} | code:${batchErr.code} | hint:${batchErr.hint}`);
      }
    }

    await db.from('campaigns').update({ sent_count: sentCount, failed_count: failedCount, filtered_count: filteredCount }).eq('id', campaignId);
  };

  const tmplHeaderType = template?.header_type?.toUpperCase();
  const isMediaHeader  = tmplHeaderType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tmplHeaderType);
  const headerMediaId  = isMediaHeader ? (campaign.media_id as string | undefined ?? undefined) : undefined;
  const headerMediaType = headerMediaId ? (tmplHeaderType?.toLowerCase() ?? undefined) : undefined;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    // Fire all messages in this batch concurrently
    // Inner fn always returns (never throws) so settled.status is always 'fulfilled'
    // and we always have contact info to track failures in campaign_recipients
    const results = await Promise.allSettled(
      batch.map(async (contact) => {
        try {
          if (template) {
            const variables = buildVariables(template, contact);
            const result = await sendTemplateMessage(ws, sanitizePhone(contact.phone), template.name, template.language ?? 'en', variables, headerMediaId, headerMediaType);
            return { contact, result, msgContent: template.body, msgType: 'template' as const };
          } else {
            const result = await sendMediaMessage(ws, sanitizePhone(contact.phone), campaign.media_id as string, campaign.media_type as string)
              .catch((e: unknown) => ({ success: false, error: String(e) }));
            return { contact, result, msgContent: `[${campaign.media_type}]`, msgType: campaign.media_type as string ?? 'image' };
          }
        } catch (e) {
          return { contact, result: { success: false, error: String(e) }, msgContent: '', msgType: 'template' as const };
        }
      }),
    );

    // Collect results into pending batch for DB
    for (const settled of results) {
      if (settled.status === 'rejected') {
        // Promise itself rejected (should not happen — inner fn catches errors)
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
        console.error(`[Campaign ${campaignId}] Failed → ${contact.phone}:`, result.error);
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
        // Cache as invalid WhatsApp number if Meta API says so — skip next campaign
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

  await db.from('campaigns').update({
    status: 'completed', completed_at: new Date().toISOString(),
    sent_count: sentCount, failed_count: failedCount, filtered_count: filteredCount,
  }).eq('id', campaignId);

  return { campaignId, total: audienceSize, sent: sentCount, failed: failedCount, filtered: filteredCount };
}
