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
    const { data: workspace, error: workspaceError } = await adminDb
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', conversation.workspace_id)
      .single();

    if (workspaceError || !workspace?.phone_number_id || !workspace.access_token) {
      return NextResponse.json({ error: 'Missing workspace WhatsApp configuration' }, { status: 400 });
    }

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
      await adminDb
        .from('messages')
        .update({ status: 'failed', metadata: { whatsapp_error: waData } })
        .eq('id', message.id);

      console.error('[Send] WhatsApp API error:', waData);
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

    return NextResponse.json({ success: true, messageId: message.id, waMessageId });
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
