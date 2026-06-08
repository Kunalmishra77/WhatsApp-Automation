import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/chat-widgets?workspaceId=xxx
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;
    const { data } = await db
      .from('chat_widgets')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at');
    return NextResponse.json({ widgets: data ?? [] });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/chat-widgets
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.workspaceId || !body.phone_number) {
      return NextResponse.json({ error: 'workspaceId and phone_number required' }, { status: 400 });
    }
    await requireWorkspacePermission(body.workspaceId as string, 'manage_workspace');
    const db = createAdminClient() as any;
    const { data, error } = await db.from('chat_widgets').insert({
      workspace_id:    body.workspaceId,
      name:            body.name ?? 'My Widget',
      phone_number:    body.phone_number,
      prefill_message: body.prefill_message ?? 'Hello! I have a question.',
      greeting_text:   body.greeting_text ?? 'Hi there! How can we help you?',
      business_name:   body.business_name ?? 'Support',
      avatar_url:      body.avatar_url ?? null,
      button_color:    body.button_color ?? '#25D366',
      position:        body.position ?? 'bottom-right',
      button_label:    body.button_label ?? 'Chat with us',
      show_label:      body.show_label ?? true,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ widget: data }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
