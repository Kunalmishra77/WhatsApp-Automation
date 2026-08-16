// app/api/admin/conversations/[id]/messages/route.ts
// Platform-admin "Client Inboxes" oversight — returns the full message thread for a
// single conversation in ANY client workspace. Uses createAdminClient() (bypasses
// RLS) and performs NO workspace-membership check (the platform admin is not a
// member) — so requirePlatformAdmin() below, run BEFORE any data access, is the
// sole cross-tenant guard.
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requirePlatformAdmin } from '@/lib/require-platform-admin';
import { authzResponse, AuthzError } from '@/lib/authz';

export const runtime = 'nodejs';

// GET /api/admin/conversations/[id]/messages?limit=200&offset=0
// Thread ordered oldest→newest. Defaults to a 200-message page; offset paginates.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // SECURITY: platform-admin gate BEFORE any data access.
    await requirePlatformAdmin();

    const { id: conversationId } = await params;
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 500);
    const offset = Math.max(Number(sp.get('offset')) || 0, 0);

    const db = createAdminClient() as any;

    // Look up the conversation via the admin client (no membership check — platform
    // admin). 404 if it doesn't exist.
    const { data: conversation, error: convErr } = await db
      .from('conversations')
      .select('id, workspace_id, channel, status, contact_id, contacts(id, name, phone, avatar_url)')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Full thread, oldest→newest, excluding soft-deleted messages (mirrors
    // modules/conversations/services/message.service.ts). Exact count so the UI can
    // page through the whole thread.
    const { data: messages, error: msgErr, count: total } = await db
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (msgErr) {
      console.error('[AdminInbox thread] messages query error:', msgErr.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({
      conversation,
      messages: messages ?? [],
      total: Number(total ?? 0),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[AdminInbox thread]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
