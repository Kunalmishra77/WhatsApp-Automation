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
  if (headerMediaId && headerMediaType) {
    components.push({
      type: 'header',
      parameters: [{ type: headerMediaType, [headerMediaType]: { id: headerMediaId } }],
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
): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
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
  } catch (err) {
    console.error(`[Campaign] Media send failed → ${toPhone}:`, err);
  }
}

export interface CampaignRunResult {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
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

  if (campaign.status === 'running')   return { campaignId, total: 0, sent: 0, failed: 0, skipped: 'already running' };
  if (campaign.status === 'completed') return { campaignId, total: 0, sent: 0, failed: 0, skipped: 'already completed' };

  const template = campaign.templates as (Template & { header_type?: string; header_content?: string }) | null;
  if (!template) throw new Error(`No template for campaign ${campaignId}`);

  const { data: workspace } = await db
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', campaign.workspace_id)
    .single();

  const phoneNumberId = workspace?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = workspace?.access_token    ?? process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) throw new Error('Missing WhatsApp credentials');

  const ws: Workspace = { phone_number_id: phoneNumberId, access_token: accessToken };

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

  const { data: contacts } = await contactQuery as { data: Contact[] | null };
  const recipients = contacts ?? [];

  if (recipients.length === 0) {
    await db.from('campaigns').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', campaignId);
    return { campaignId, total: 0, sent: 0, failed: 0, skipped: 'no contacts' };
  }

  await db.from('campaigns').update({
    status: 'running', started_at: new Date().toISOString(), total_recipients: recipients.length,
  }).eq('id', campaignId);

  let sentCount = 0;
  let failedCount = 0;

  for (const contact of recipients) {
    const variables = buildVariables(template, contact);

    // Determine header media: prefer campaign's own media_id, fall back to template's example handle
    const tmplHeaderType = template.header_type?.toUpperCase();
    const isMediaHeader  = tmplHeaderType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tmplHeaderType);
    const headerMediaId  = isMediaHeader ? (campaign.media_id as string | undefined ?? undefined) : undefined;
    const headerMediaType = headerMediaId ? (tmplHeaderType?.toLowerCase() ?? undefined) : undefined;

    const result = await sendTemplateMessage(ws, contact.phone, template.name, template.language ?? 'en', variables, headerMediaId, headerMediaType);

    if (result.success) {
      sentCount++;

      // Find or note conversation
      const convQuery = await db
        .from('conversations')
        .select('id')
        .eq('workspace_id', campaign.workspace_id)
        .eq('contact_id', contact.id)
        .maybeSingle();

      const conversationId: string | null = convQuery.data?.id ?? null;

      if (conversationId) {
        await db.from('messages').insert({
          conversation_id: conversationId,
          workspace_id:    campaign.workspace_id,
          sender_type:     'agent',
          direction:       'outbound',
          type:            'template',
          content:         template.body,
          status:          'sent',
          whatsapp_msg_id: result.waMessageId ?? null,
          metadata:        { campaign_id: campaignId, template_name: template.name },
        });
      }

      // Save per-recipient row for tracking
      await db.from('campaign_recipients').insert({
        campaign_id:     campaignId,
        workspace_id:    campaign.workspace_id,
        contact_id:      contact.id,
        phone:           contact.phone,
        name:            contact.name ?? null,
        status:          'sent',
        whatsapp_msg_id: result.waMessageId ?? null,
        conversation_id: conversationId,
      });

      // Send optional media attachment (non-blocking; works only in active 24hr window)
      if (campaign.media_id && campaign.media_type) {
        await sendMediaMessage(ws, contact.phone, campaign.media_id as string, campaign.media_type as string);
        await new Promise((r) => setTimeout(r, 100));
      }
    } else {
      failedCount++;
      console.error(`[Campaign ${campaignId}] Failed → ${contact.phone}:`, result.error);

      await db.from('campaign_recipients').insert({
        campaign_id:   campaignId,
        workspace_id:  campaign.workspace_id,
        contact_id:    contact.id,
        phone:         contact.phone,
        name:          contact.name ?? null,
        status:        'failed',
        error_message: result.error ?? 'WhatsApp API error',
      });
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  await db.from('campaigns').update({
    status: 'completed', completed_at: new Date().toISOString(),
    sent_count: sentCount, failed_count: failedCount,
  }).eq('id', campaignId);

  return { campaignId, total: recipients.length, sent: sentCount, failed: failedCount };
}
