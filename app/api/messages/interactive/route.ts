import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';

interface ButtonItem {
  id: string;
  title: string;
}

interface ListRow {
  id: string;
  title: string;
  description?: string;
}

interface ListSection {
  title: string;
  rows: ListRow[];
}

interface InteractiveRequestBody {
  conversationId?: string;
  type?: 'button' | 'list';
  body?: string;
  header?: string;
  footer?: string;
  buttons?: ButtonItem[];
  sections?: ListSection[];
  listButtonText?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as InteractiveRequestBody;
    const { conversationId, type, body, header, footer, buttons, sections, listButtonText } = payload;

    if (!conversationId || !type || !body?.trim()) {
      return NextResponse.json({ error: 'Missing required fields: conversationId, type, body' }, { status: 400 });
    }

    if (type !== 'button' && type !== 'list') {
      return NextResponse.json({ error: 'type must be "button" or "list"' }, { status: 400 });
    }

    if (type === 'button') {
      if (!buttons || buttons.length === 0) {
        return NextResponse.json({ error: 'buttons array is required for type "button"' }, { status: 400 });
      }
      if (buttons.length > 3) {
        return NextResponse.json({ error: 'Maximum 3 buttons allowed' }, { status: 400 });
      }
    }

    if (type === 'list') {
      if (!sections || sections.length === 0) {
        return NextResponse.json({ error: 'sections array is required for type "list"' }, { status: 400 });
      }
      if (!listButtonText?.trim()) {
        return NextResponse.json({ error: 'listButtonText is required for type "list"' }, { status: 400 });
      }
    }

    const supabase = await createClient();
    const db = supabase as any;
    const { data: conversation, error: conversationError } = await db
      .from('conversations')
      .select('id, workspace_id, contact:contacts(id, phone)')
      .eq('id', conversationId)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const authz = await requireWorkspacePermission(
      conversation.workspace_id,
      'handle_conversations',
    );

    const contact = conversation.contact as unknown as { id: string; phone: string } | null;
    if (!contact?.phone) {
      return NextResponse.json({ error: 'Conversation contact is missing a phone number' }, { status: 400 });
    }

    const admin = createAdminClient();
    const adminDb = admin as any;
    const { data: workspace, error: workspaceError } = await adminDb
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', conversation.workspace_id)
      .single();

    const phoneNumberId = workspace?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = workspace?.access_token ?? process.env.WHATSAPP_ACCESS_TOKEN;

    if (workspaceError || !phoneNumberId || !accessToken) {
      return NextResponse.json({ error: 'Missing workspace WhatsApp configuration' }, { status: 400 });
    }

    // Build interactive object
    const interactiveObj: Record<string, unknown> = {
      type,
      body: { text: body.trim() },
    };

    if (header?.trim()) {
      interactiveObj.header = { type: 'text', text: header.trim() };
    }

    if (footer?.trim()) {
      interactiveObj.footer = { text: footer.trim() };
    }

    if (type === 'button' && buttons) {
      interactiveObj.action = {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title },
        })),
      };
    } else if (type === 'list' && sections && listButtonText) {
      interactiveObj.action = {
        button: listButtonText.trim(),
        sections: sections.map((section) => ({
          title: section.title,
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title,
            ...(row.description ? { description: row.description } : {}),
          })),
        })),
      };
    }

    const waPayload = {
      messaging_product: 'whatsapp',
      to: contact.phone,
      type: 'interactive',
      interactive: interactiveObj,
    };

    // Save message first (queued)
    const { data: message, error: messageError } = await adminDb
      .from('messages')
      .insert({
        conversation_id: conversationId,
        workspace_id: conversation.workspace_id,
        sender_id: authz.userId,
        sender_type: 'agent',
        direction: 'outbound',
        type: 'interactive',
        content: body.trim(),
        status: 'queued',
        metadata: {
          interactive_type: type,
          payload: interactiveObj,
        },
      })
      .select()
      .single();

    if (messageError || !message) {
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    // Send to WhatsApp API
    const waResponse = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(accessToken as string).replace(/﻿/g, '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(waPayload),
      },
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      await adminDb
        .from('messages')
        .update({ status: 'failed', metadata: { interactive_type: type, payload: interactiveObj, whatsapp_error: waData } })
        .eq('id', message.id);

      console.error('[Interactive] WhatsApp API error:', waData);
      return NextResponse.json(
        { error: waData?.error?.message ?? 'WhatsApp API error', details: waData },
        { status: 502 },
      );
    }

    const waMessageId = waData?.messages?.[0]?.id;

    await adminDb
      .from('messages')
      .update({ status: 'sent', whatsapp_msg_id: waMessageId ?? null })
      .eq('id', message.id);

    // Update conversation last_message + last_message_at
    await adminDb
      .from('conversations')
      .update({
        last_message: body.trim(),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return NextResponse.json({ success: true, messageId: message.id, waMessageId });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (error instanceof Error && error.message !== 'Internal server error') {
      return authzResponse(error);
    }

    console.error('[Interactive] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
