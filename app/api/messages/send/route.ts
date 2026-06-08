import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';

export async function POST(request: NextRequest) {
  try {
    const { conversationId, content } = await request.json() as {
      conversationId?: string;
      content?: string;
    };

    const trimmed = content?.trim();
    if (!conversationId || !trimmed) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = await createClient();
    const db = supabase as any;
    const { data: conversation, error: conversationError } = await db
      .from('conversations')
      .select('id, workspace_id, channel, meta, contact:contacts(id, phone)')
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
    const channel = (conversation as any).channel as string ?? 'whatsapp';
    const convMeta = (conversation as any).meta as Record<string, string> | null;

    if (!contact?.phone) {
      return NextResponse.json({ error: 'Conversation contact is missing a phone number' }, { status: 400 });
    }

    // Enforce monthly message limit — auto-halt workspace if exceeded
    try {
      const { getWorkspacePlan, guardMessageLimit } = await import('@/lib/plan-guard');
      const wsPlan = await getWorkspacePlan(conversation.workspace_id);
      await guardMessageLimit(conversation.workspace_id, wsPlan);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PlanLimitError') {
        // Auto-halt the workspace so the client sees the upgrade prompt
        void createAdminClient().from('workspaces' as any)
          .update({ subscription_status: 'halted' })
          .eq('id', conversation.workspace_id)
          .then(() => {});
        return NextResponse.json({ error: (e as Error).message, code: 'PLAN_LIMIT_EXCEEDED' }, { status: 402 });
      }
    }

    const admin = createAdminClient();
    const adminDb = admin as any;

    // \u2500\u2500 Save message record (pending, channel-agnostic) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const { data: message, error: messageError } = await adminDb
      .from('messages')
      .insert({
        conversation_id: conversationId,
        workspace_id: conversation.workspace_id,
        sender_id: authz.userId,
        sender_type: 'agent',
        direction: 'outbound',
        type: 'text',
        content: trimmed,
        status: 'queued',
      })
      .select()
      .single();

    if (messageError || !message) {
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    // \u2500\u2500 Send via appropriate channel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    if (channel === 'instagram') {
      const igSenderId = convMeta?.ig_sender_id ?? contact.phone.replace(/^ig:/, '');

      const { data: igAccount } = await adminDb
        .from('instagram_accounts')
        .select('ig_user_id, access_token')
        .eq('workspace_id', conversation.workspace_id)
        .single();

      if (!igAccount?.ig_user_id || !igAccount.access_token) {
        await adminDb.from('messages').update({ status: 'failed' }).eq('id', message.id);
        return NextResponse.json({ error: 'Instagram account not connected for this workspace' }, { status: 400 });
      }

      const igResponse = await fetch(
        `https://graph.facebook.com/v19.0/${igAccount.ig_user_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${igAccount.access_token.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { id: igSenderId },
            message:   { text: trimmed },
          }),
        },
      );

      const igData = await igResponse.json() as { message_id?: string; error?: { message: string } };

      if (!igResponse.ok) {
        await adminDb.from('messages').update({ status: 'failed', metadata: { ig_error: igData } }).eq('id', message.id);
        console.error('[Send] Instagram API error:', igData);
        return NextResponse.json({ error: igData?.error?.message ?? 'Instagram API error' }, { status: 502 });
      }

      await adminDb.from('messages').update({ status: 'sent', whatsapp_msg_id: igData.message_id ?? null }).eq('id', message.id);

    } else {
      // WhatsApp send
      const { data: workspace, error: workspaceError } = await adminDb
        .from('workspaces')
        .select('phone_number_id, access_token')
        .eq('id', conversation.workspace_id)
        .single();

      if (workspaceError || !workspace?.phone_number_id || !workspace.access_token) {
        await adminDb.from('messages').update({ status: 'failed' }).eq('id', message.id);
        return NextResponse.json({ error: 'Missing workspace WhatsApp configuration' }, { status: 400 });
      }

      const waResponse = await fetch(
        `https://graph.facebook.com/v19.0/${workspace.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${workspace.access_token.replace(/\uFEFF/g, '').trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: contact.phone,
            type: 'text',
            text: { preview_url: false, body: trimmed },
          }),
        },
      );

      const waData = await waResponse.json();

      if (!waResponse.ok) {
        await adminDb.from('messages').update({ status: 'failed', metadata: { whatsapp_error: waData } }).eq('id', message.id);
        console.error('[Send] WhatsApp API error:', waData);
        return NextResponse.json({ error: waData?.error?.message ?? 'WhatsApp API error', details: waData }, { status: 502 });
      }

      const waMessageId = waData?.messages?.[0]?.id;
      await adminDb.from('messages').update({ status: 'sent', whatsapp_msg_id: waMessageId ?? null }).eq('id', message.id);
    }

    // SLA: record first_replied_at if not set yet
    const { data: conv } = await adminDb
      .from('conversations')
      .select('first_replied_at')
      .eq('id', conversationId)
      .single();
    if (!conv?.first_replied_at) {
      await adminDb
        .from('conversations')
        .update({ first_replied_at: new Date().toISOString() })
        .eq('id', conversationId);
    }

    return NextResponse.json({ success: true, messageId: message.id });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (error instanceof Error && error.message !== 'Internal server error') {
      return authzResponse(error);
    }

    console.error('[Send] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
