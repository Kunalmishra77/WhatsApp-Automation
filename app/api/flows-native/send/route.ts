import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { AuthzError, authzResponse, requireWorkspacePermission } from '@/lib/authz';
import { assertWorkspaceActive, suspendedResponse, SuspendedError } from '@/lib/billing-guard';
import { NATIVE_FLOW_TEMPLATES, newFlowToken } from '@/lib/native-flows';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { conversationId, templateKey, header, body, footer, cta } = await request.json() as {
      conversationId?: string;
      templateKey?: string;
      header?: string;
      body?: string;
      footer?: string;
      cta?: string;
    };

    const template = templateKey ? NATIVE_FLOW_TEMPLATES[templateKey] : undefined;

    if (!conversationId || !templateKey || !template) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    const { data: conversation, error: conversationError } = await db
      .from('conversations')
      .select('id, workspace_id, contact:contacts(id, phone)')
      .eq('id', conversationId)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const ctx = await requireWorkspacePermission(conversation.workspace_id, 'handle_conversations');

    // Suspension guard — blocks the outbound send for suspended/cancelled
    // workspaces. Fails open on any internal error (see lib/billing-guard.ts).
    try {
      await assertWorkspaceActive(createAdminClient(), conversation.workspace_id);
    } catch (e) {
      if (e instanceof SuspendedError) {
        return suspendedResponse();
      }
      console.error('[FlowSend] guard', e);
    }

    // ── Published form lookup ────────────────────────────────────────────
    const { data: form } = await db
      .from('flows_meta')
      .select('meta_flow_id, status, name')
      .eq('workspace_id', conversation.workspace_id)
      .eq('template_key', templateKey)
      .maybeSingle();

    if (!form || form.status !== 'published' || !form.meta_flow_id) {
      return NextResponse.json({ error: 'This form is not published yet — publish it first.' }, { status: 400 });
    }

    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;

    if (!contact?.phone) {
      return NextResponse.json({ error: 'Conversation contact is missing a phone number' }, { status: 400 });
    }

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', conversation.workspace_id)
      .single();

    if (workspaceError || !workspace?.phone_number_id || !workspace.access_token) {
      return NextResponse.json({ error: 'Missing workspace WhatsApp configuration' }, { status: 400 });
    }

    const token = workspace.access_token.replace(/﻿/g, '').trim();

    const flowToken = newFlowToken();

    // ── Session row (before sending, so we can correlate the eventual nfm_reply) ─
    // Must succeed before we send — otherwise a submitted form has nothing to
    // correlate against and the reply is silently lost.
    const { error: sessErr } = await db.from('flow_sessions_native').insert({
      workspace_id: conversation.workspace_id,
      conversation_id: conversationId,
      contact_id: contact.id,
      flow_token: flowToken,
      template_key: templateKey,
      meta_flow_id: form.meta_flow_id,
      status: 'sent',
    });

    if (sessErr) {
      console.error('[FlowSend] Failed to create flow session:', sessErr);
      return NextResponse.json({ error: 'Failed to create flow session' }, { status: 500 });
    }

    const interactive: Record<string, unknown> = {
      type: 'flow',
      body: { text: body ?? 'Please fill this quick form 📋' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: form.meta_flow_id,
          flow_cta: cta ?? 'Open Form',
          flow_action: 'navigate',
          flow_action_payload: { screen: template.firstScreen, data: { flow_token: flowToken } },
        },
      },
    };

    if (header) {
      interactive.header = { type: 'text', text: header };
    }
    if (footer) {
      interactive.footer = { text: footer };
    }

    const waResponse = await fetch(
      `https://graph.facebook.com/v19.0/${workspace.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: contact.phone,
          type: 'interactive',
          interactive,
        }),
      },
    );

    const waData = await waResponse.json();

    if (!waResponse.ok || !waData?.messages?.[0]?.id) {
      console.error('[FlowSend] WhatsApp API error:', waData);
      // Nothing was actually delivered — don't leave the session looking 'sent'.
      await db.from('flow_sessions_native').update({ status: 'failed' }).eq('flow_token', flowToken);
      return NextResponse.json({ error: waData?.error?.message ?? 'WhatsApp API error', details: waData }, { status: 502 });
    }

    const { data: msgRow, error: msgErr } = await db
      .from('messages')
      .insert({
        conversation_id: conversationId,
        workspace_id: conversation.workspace_id,
        sender_id: ctx.userId,
        sender_type: 'agent',
        direction: 'outbound',
        type: 'interactive',
        content: '📋 Sent form: ' + form.name,
        status: 'sent',
        whatsapp_msg_id: waData.messages[0].id,
        metadata: { flow_token: flowToken, meta_flow_id: form.meta_flow_id, template_key: templateKey },
      })
      .select('id')
      .single();

    if (msgErr) {
      // The WhatsApp send already succeeded — log and continue rather than
      // report failure for a message that was actually delivered.
      console.error('[FlowSend] Failed to insert messages row:', msgErr);
    }

    await db
      .from('conversations')
      .update({ last_message: '📋 Sent form: ' + form.name, last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return NextResponse.json({ ok: true, messageId: msgRow?.id ?? null });
  } catch (error) {
    if (error instanceof AuthzError) {
      return authzResponse(error);
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    console.error('[FlowSend] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
