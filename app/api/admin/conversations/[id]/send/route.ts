// app/api/admin/conversations/[id]/send/route.ts
// Platform-admin "Client Inboxes" oversight — lets the owner REPLY into ANY client
// workspace's conversation. The outbound message goes out ON THE CLIENT'S own
// WhatsApp/Instagram number (the target workspace's Graph credentials), with a
// full audit trail attributing it to the platform admin.
//
// Mirrors the WhatsApp + Instagram send/save flow of app/api/messages/send exactly
// (Graph API v19.0, per-workspace access_token/phone_number_id, IG via
// instagram_accounts, message insert queued→sent/failed, first_replied_at), with
// the differences called out inline below. Uses createAdminClient() (bypasses RLS);
// requirePlatformAdmin() below runs BEFORE any data access and is the sole
// cross-tenant guard.
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { authzResponse, AuthzError } from '@/lib/authz';

export const runtime = 'nodejs';

// POST /api/admin/conversations/[id]/send  body: { content }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // SECURITY: platform-admin gate BEFORE any data access. Capture userId for the
    // audit trail (sender_id + metadata below).
    const ctx = await requirePlatformAdmin();

    const { id } = await params;
    const { content } = (await request.json()) as { content?: string };
    const trimmed = content?.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Missing content' }, { status: 400 });
    }

    const admin = createAdminClient();
    const adminDb = admin as any;

    const { data: conversation, error: conversationError } = await adminDb
      .from('conversations')
      .select('id, workspace_id, channel, meta, contact:contacts(id, phone)')
      .eq('id', id)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const workspaceId = conversation.workspace_id as string;

    // NOTE: unlike app/api/messages/send, this route deliberately SKIPS
    //   (a) requireWorkspacePermission (workspace-membership) — the platform admin
    //       is intentionally NOT a member of the client's workspace; the
    //       requirePlatformAdmin() gate above is the authorization here;
    //   (b) the billing/suspension guard (assertWorkspaceActive); and
    //   (c) the monthly plan-limit guard (guardMessageLimit).
    // A platform admin performing oversight/support must NOT be blocked by the
    // client's billing state (suspended / halted / over-limit) — those guards exist
    // to gate the CLIENT's own sending, not internal admin replies.

    const contact = conversation.contact as unknown as { id: string; phone: string } | null;
    const channel = ((conversation as any).channel as string) ?? 'whatsapp';
    const convMeta = (conversation as any).meta as Record<string, string> | null;

    if (!contact?.phone) {
      return NextResponse.json({ error: 'Conversation contact is missing a phone number' }, { status: 400 });
    }

    // AUDIT TRAIL: attribute the message to the platform admin (sender_id) and flag
    // it as an admin send in metadata so the client-facing thread + any auditing can
    // distinguish oversight replies from the client's own agents.
    console.log('[AdminInbox] platform admin', ctx.userId, 'sent into conversation', id, 'workspace', workspaceId);

    // ── Save message record (queued) ───────────────────────────────────────────
    const { data: message, error: messageError } = await adminDb
      .from('messages')
      .insert({
        conversation_id: id,
        workspace_id: workspaceId,
        sender_id: ctx.userId,
        sender_type: 'agent',
        direction: 'outbound',
        type: 'text',
        content: trimmed,
        status: 'queued',
        metadata: { platform_admin_send: true, platform_admin_id: ctx.userId },
      })
      .select()
      .single();

    if (messageError || !message) {
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }

    // ── Send via the appropriate channel, on the CLIENT'S number ───────────────
    if (channel === 'instagram') {
      const igSenderId = convMeta?.ig_sender_id ?? contact.phone.replace(/^ig:/, '');

      const { data: igAccount } = await adminDb
        .from('instagram_accounts')
        .select('ig_user_id, access_token')
        .eq('workspace_id', workspaceId)
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
            message: { text: trimmed },
          }),
        },
      );

      const igData = (await igResponse.json()) as { message_id?: string; error?: { message: string } };

      if (!igResponse.ok) {
        // Surface the Graph API error (e.g. outside the 24h window), mark failed, 502.
        await adminDb.from('messages').update({ status: 'failed', metadata: { platform_admin_send: true, platform_admin_id: ctx.userId, ig_error: igData } }).eq('id', message.id);
        console.error('[AdminInbox] Instagram API error:', igData);
        return NextResponse.json({ error: igData?.error?.message ?? 'Instagram API error' }, { status: 502 });
      }

      await adminDb.from('messages').update({ status: 'sent', whatsapp_msg_id: igData.message_id ?? null }).eq('id', message.id);
    } else {
      // WhatsApp send — uses the target workspace's own phone_number_id/access_token.
      const { data: workspace, error: workspaceError } = await adminDb
        .from('workspaces')
        .select('phone_number_id, access_token')
        .eq('id', workspaceId)
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
            Authorization: `Bearer ${workspace.access_token.replace(/﻿/g, '').trim()}`,
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
        // Surface the Graph API error (e.g. outside the 24h window), mark failed, 502.
        await adminDb.from('messages').update({ status: 'failed', metadata: { platform_admin_send: true, platform_admin_id: ctx.userId, whatsapp_error: waData } }).eq('id', message.id);
        console.error('[AdminInbox] WhatsApp API error:', waData);
        return NextResponse.json({ error: waData?.error?.message ?? 'WhatsApp API error', details: waData }, { status: 502 });
      }

      const waMessageId = waData?.messages?.[0]?.id;
      await adminDb.from('messages').update({ status: 'sent', whatsapp_msg_id: waMessageId ?? null }).eq('id', message.id);
    }

    // ── Post-send conversation updates ─────────────────────────────────────────
    // Reflect the outbound reply on the conversation row (list preview) and record
    // first_replied_at (SLA) if this is the first outbound reply.
    const nowIso = new Date().toISOString();
    const { data: conv } = await adminDb
      .from('conversations')
      .select('first_replied_at')
      .eq('id', id)
      .single();

    const convUpdate: Record<string, unknown> = {
      last_message: trimmed,
      last_message_at: nowIso,
    };
    if (!conv?.first_replied_at) convUpdate.first_replied_at = nowIso;

    await adminDb.from('conversations').update(convUpdate).eq('id', id);

    return NextResponse.json({ success: true, messageId: message.id });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    console.error('[AdminInbox send] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
