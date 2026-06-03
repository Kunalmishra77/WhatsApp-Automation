import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { dispatchWebhookEvent } from '@/lib/outbound-webhook';

function buildCsatMessage(workspaceName: string) {
  return `Thank you for contacting ${workspaceName}! 🙏\n\nHow would you rate your experience today?\nReply with a number:\n1 ⭐ - Poor\n2 ⭐⭐ - Fair\n3 ⭐⭐⭐ - Good\n4 ⭐⭐⭐⭐ - Very Good\n5 ⭐⭐⭐⭐⭐ - Excellent`;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params;
    const supabase = createAdminClient();
    const db = supabase as any;

    // 1. Fetch conversation with contact phone
    const { data: conversation, error: fetchError } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id, assigned_agent_id, contacts(id, phone)')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Permission check
    const authz = await requireWorkspacePermission(
      conversation.workspace_id,
      'handle_conversations',
    );

    // 3. Update conversation → resolved
    const { error: updateError } = await db
      .from('conversations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to resolve conversation' }, { status: 500 });
    }

    // 4. Load workspace credentials + name for branded CSAT
    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token, name')
      .eq('id', conversation.workspace_id)
      .single();
    const csatMessage = buildCsatMessage((ws?.name as string | null) ?? 'Us');

    // 5. Extract contact phone + id
    const contactPhone: string | null = conversation.contacts?.phone ?? null;
    const contactId: string | null = conversation.contacts?.id ?? null;

    // 6. Send CSAT WhatsApp message + insert pending record
    if (ws?.phone_number_id && ws?.access_token && contactPhone) {
      try {
        await fetch(
          `https://graph.facebook.com/v19.0/${(ws.phone_number_id as string)}/messages`,
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
              text: { preview_url: false, body: csatMessage },
            }),
          },
        );
      } catch (err) {
        console.error('[Resolve] Failed to send CSAT message:', err);
        // Non-fatal — resolution already saved
      }

      // 7. Insert pending CSAT record (score = null until user replies)
      await db.from('csat_responses').insert({
        workspace_id:    conversation.workspace_id,
        conversation_id: conversationId,
        contact_id:      contactId,
        agent_id:        authz.userId,
        score:           null,
      });
    }

    void dispatchWebhookEvent(conversation.workspace_id as string, 'conversation.resolved', {
      conversation_id: conversationId,
      contact_id: contactId,
      resolved_by: authz.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Resolve] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
