import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/conversations/[id]/mark-read
// Marks all inbound messages as read in DB + sends WhatsApp read receipt
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params;
    const db = createAdminClient() as any;

    // Get conversation + workspace creds
    const { data: conv } = await db
      .from('conversations')
      .select('workspace_id')
      .eq('id', conversationId)
      .single();

    if (!conv) return NextResponse.json({ ok: false }, { status: 404 });

    await requireWorkspacePermission(conv.workspace_id, 'handle_conversations');

    // Reset unread count in DB
    await db
      .from('conversations')
      .update({ unread_count: 0 } as never)
      .eq('id', conversationId);

    // Get the latest inbound message with a WhatsApp message ID
    const { data: latestMsg } = await db
      .from('messages')
      .select('whatsapp_msg_id')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .not('whatsapp_msg_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestMsg?.whatsapp_msg_id) {
      return NextResponse.json({ ok: true, receipt: false });
    }

    // Get workspace WhatsApp credentials
    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', conv.workspace_id)
      .single();

    const phoneNumberId = ws?.phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = ws?.access_token    ?? process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ ok: true, receipt: false });
    }

    // Send read receipt to WhatsApp — this triggers blue tick on sender's phone
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${(accessToken as string).replace(/﻿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status:            'read',
        message_id:        latestMsg.whatsapp_msg_id,
      }),
    });

    return NextResponse.json({ ok: true, receipt: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Mark Read]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
