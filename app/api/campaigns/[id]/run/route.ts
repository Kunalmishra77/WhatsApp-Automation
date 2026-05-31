import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';

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

// Replace {{1}}, {{2}} etc. with contact field values
function buildVariables(template: Template, contact: Contact): string[] {
  return template.variables.map((v, i) => {
    if (i === 0) return contact.name ?? contact.phone; // {{1}} = name
    if (i === 1) return contact.phone;                  // {{2}} = phone
    return '';
  });
}

async function sendTemplateMessage(
  workspace: Workspace,
  toPhone: string,
  templateName: string,
  language: string,
  variables: string[],
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  const components = variables.length > 0
    ? [{
        type: 'body',
        parameters: variables.map((v) => ({ type: 'text', text: v || ' ' })),
      }]
    : [];

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${workspace.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workspace.access_token.replace(/﻿/g, '').trim()}`,
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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const admin = createAdminClient();
    const db    = admin as any;

    // Load campaign
    const { data: campaign, error: campError } = await db
      .from('campaigns')
      .select('*, templates(name, language, body, variables)')
      .eq('id', campaignId)
      .single();

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    if (campaign.status === 'running') {
      return NextResponse.json({ error: 'Campaign already running' }, { status: 409 });
    }
    if (campaign.status === 'completed') {
      return NextResponse.json({ error: 'Campaign already completed' }, { status: 409 });
    }

    const template = campaign.templates as Template | null;
    if (!template) {
      return NextResponse.json({ error: 'Template not found for campaign' }, { status: 400 });
    }

    // Load workspace credentials
    const { data: workspace } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', campaign.workspace_id)
      .single();

    const phoneNumberId = workspace?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = workspace?.access_token    ?? process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ error: 'Missing WhatsApp credentials' }, { status: 400 });
    }

    const ws: Workspace = { phone_number_id: phoneNumberId, access_token: accessToken };

    // Load contacts based on audience filter
    let contactQuery = db
      .from('contacts')
      .select('id, phone, name, tags')
      .eq('workspace_id', campaign.workspace_id)
      .eq('is_blocked', false)
      .eq('opted_out', false);

    if (campaign.audience_type === 'tag' && campaign.audience_filter?.tag) {
      contactQuery = contactQuery.contains('tags', [campaign.audience_filter.tag]);
    }

    const { data: contacts } = await contactQuery as { data: Contact[] | null };
    const recipients = contacts ?? [];

    if (recipients.length === 0) {
      await db.from('campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaignId);
      return NextResponse.json({ success: true, sent: 0, failed: 0, message: 'No contacts in audience' });
    }

    // Mark as running
    await db.from('campaigns').update({
      status:           'running',
      started_at:       new Date().toISOString(),
      total_recipients: recipients.length,
    }).eq('id', campaignId);

    let sentCount   = 0;
    let failedCount = 0;

    for (const contact of recipients) {
      const variables = buildVariables(template, contact);
      const result    = await sendTemplateMessage(ws, contact.phone, template.name, template.language ?? 'en', variables);

      if (result.success) {
        sentCount++;
        // Save outbound campaign message record
        const convQuery = await db
          .from('conversations')
          .select('id')
          .eq('workspace_id', campaign.workspace_id)
          .eq('contact_id', contact.id)
          .maybeSingle();

        if (convQuery.data?.id) {
          await db.from('messages').insert({
            conversation_id: convQuery.data.id,
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
      } else {
        failedCount++;
        console.error(`[Campaign] Failed to send to ${contact.phone}:`, result.error);
      }

      // 200ms delay to respect WhatsApp rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    // Mark completed
    await db.from('campaigns').update({
      status:       'completed',
      completed_at: new Date().toISOString(),
      sent_count:   sentCount,
      failed_count: failedCount,
    }).eq('id', campaignId);

    return NextResponse.json({
      success:    true,
      total:      recipients.length,
      sent:       sentCount,
      failed:     failedCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message !== 'Internal server error') {
      return authzResponse(error);
    }
    console.error('[Campaign Run] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
