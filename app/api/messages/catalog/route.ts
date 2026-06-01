import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function POST(request: NextRequest) {
  try {
    const {
      conversationId,
      catalogId,
      productId,
      bodyText,
    } = await request.json() as {
      conversationId?: string;
      catalogId?: string;
      productId?: string;
      bodyText?: string;
    };

    if (!conversationId || !catalogId || !productId) {
      return NextResponse.json(
        { error: 'conversationId, catalogId, and productId are required' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const db = supabase as any;

    const { data: conversation, error: convError } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id, contacts(phone)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const authz = await requireWorkspacePermission(
      conversation.workspace_id as string,
      'handle_conversations',
    );

    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', conversation.workspace_id)
      .single();

    if (!ws?.phone_number_id || !ws?.access_token) {
      return NextResponse.json({ error: 'Workspace WhatsApp not configured' }, { status: 400 });
    }

    const contactPhone = (conversation.contacts as { phone?: string } | null)?.phone;
    if (!contactPhone) {
      return NextResponse.json({ error: 'Contact has no phone number' }, { status: 400 });
    }

    const token = (ws.access_token as string).replace(/﻿/g, '').trim();

    const waPayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: contactPhone,
      type: 'interactive',
      interactive: {
        type: 'product',
        body: bodyText ? { text: bodyText } : undefined,
        action: {
          catalog_id: catalogId,
          product_retailer_id: productId,
        },
      },
    };

    const waRes = await fetch(
      `https://graph.facebook.com/v19.0/${ws.phone_number_id as string}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(waPayload),
      },
    );

    const waData = await waRes.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };

    if (!waRes.ok) {
      console.error('[Catalog] WhatsApp API error:', waData);
      return NextResponse.json(
        { error: waData?.error?.message ?? 'WhatsApp API error' },
        { status: waRes.status },
      );
    }

    const waMessageId = waData?.messages?.[0]?.id ?? null;

    // Save message to DB as interactive type
    await db.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: conversation.workspace_id,
      whatsapp_msg_id: waMessageId,
      sender_type: 'agent',
      sender_id: authz.userId,
      direction: 'outbound',
      type: 'interactive',
      content: bodyText ?? `Product: ${productId}`,
      status: 'sent',
      metadata: {
        interactive_type: 'product',
        catalog_id: catalogId,
        product_retailer_id: productId,
      },
    });

    // Update conversation last_message_at
    await db
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return NextResponse.json({ success: true, waMessageId });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Catalog] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
