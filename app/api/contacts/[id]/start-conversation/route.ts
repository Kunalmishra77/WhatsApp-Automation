import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contactId } = await params;
    const { templateId, mediaUrl } = await request.json() as { templateId?: string; mediaUrl?: string };

    if (!templateId) {
      return NextResponse.json({ error: 'templateId required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const db    = admin as any;

    // Load contact
    const { data: contact, error: contactError } = await db
      .from('contacts')
      .select('id, phone, name, workspace_id')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await requireWorkspacePermission(contact.workspace_id, 'handle_conversations');

    // Load template (include header_type for media headers)
    const { data: template, error: templateError } = await db
      .from('templates')
      .select('name, language, body, variables, status, header_type')
      .eq('id', templateId)
      .eq('workspace_id', contact.workspace_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (template.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved templates can be used to start conversations' }, { status: 400 });
    }

    // Load workspace credentials
    const { data: workspace } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', contact.workspace_id)
      .single();

    const phoneNumberId = workspace?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = workspace?.access_token    ?? process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ error: 'Missing WhatsApp credentials' }, { status: 400 });
    }

    // Build template variables: {{1}} = name, {{2}} = phone
    const variables: string[] = (template.variables ?? []).map((_: string, i: number) => {
      if (i === 0) return contact.name ?? contact.phone;
      if (i === 1) return contact.phone;
      return '';
    });

    const components: Array<Record<string, unknown>> = [];

    // Add header component for IMAGE/VIDEO/DOCUMENT templates
    const headerType = (template.header_type as string | null)?.toUpperCase();
    const isMediaHeader = headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType);
    if (isMediaHeader && mediaUrl) {
      const mediaKey = headerType.toLowerCase();
      const isUrl = mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://');
      components.push({
        type: 'header',
        parameters: [{
          type: mediaKey,
          [mediaKey]: isUrl ? { link: mediaUrl } : { id: mediaUrl },
        }],
      });
    }

    // Add body variables
    if (variables.length > 0) {
      components.push({ type: 'body', parameters: variables.map((v: string) => ({ type: 'text', text: v || ' ' })) });
    }

    // Send WhatsApp template message
    const waRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.replace(/﻿/g, '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:   contact.phone,
          type: 'template',
          template: {
            name:     template.name,
            language: { code: template.language ?? 'en' },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      },
    );

    const waData = await waRes.json() as { messages?: Array<{ id: string }>; error?: { message: string } };

    if (!waRes.ok) {
      return NextResponse.json(
        { error: waData?.error?.message ?? 'WhatsApp API error' },
        { status: 502 },
      );
    }

    const waMessageId = waData?.messages?.[0]?.id ?? null;
    const now = new Date().toISOString();

    // Upsert conversation
    const { data: conversation, error: convError } = await db
      .from('conversations')
      .upsert(
        {
          workspace_id:    contact.workspace_id,
          contact_id:      contact.id,
          status:          'open',
          channel:         'whatsapp',
          last_message:    template.body,
          last_message_at: now,
        },
        { onConflict: 'workspace_id,contact_id', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    // Save outbound message record
    await db.from('messages').insert({
      conversation_id: conversation.id,
      workspace_id:    contact.workspace_id,
      sender_type:     'agent',
      direction:       'outbound',
      type:            'template',
      content:         template.body,
      status:          'sent',
      whatsapp_msg_id: waMessageId,
      created_at:      now,
    });

    return NextResponse.json({ success: true, conversationId: conversation.id });
  } catch (error) {
    if (error instanceof Error && error.message !== 'Internal server error') {
      return authzResponse(error);
    }
    console.error('[StartConversation] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
