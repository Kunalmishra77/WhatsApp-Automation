import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createClient } from '@/services/supabase/server';

// POST /api/support-tickets — client submits a support ticket
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId: string;
      subject: string;
      description: string;
      category?: string;
      priority?: string;
    };

    if (!body.workspaceId || !body.subject?.trim() || !body.description?.trim()) {
      return NextResponse.json({ error: 'workspaceId, subject and description required' }, { status: 400 });
    }

    await requireWorkspacePermission(body.workspaceId, 'handle_conversations');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const db = createAdminClient() as any;

    // Get submitter email
    const { data: profile } = await db
      .from('profiles')
      .select('email, full_name')
      .eq('id', user?.id ?? '')
      .single();

    const { data, error } = await db.from('support_tickets').insert({
      workspace_id:  body.workspaceId,
      subject:       body.subject.trim(),
      description:   body.description.trim(),
      category:      body.category ?? 'general',
      priority:      body.priority ?? 'medium',
      submitted_by:  profile?.email ?? user?.email ?? 'unknown',
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data?.id });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[SupportTickets POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/support-tickets?workspaceId=xxx — client views their own tickets
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('support_tickets')
      .select('id, subject, category, priority, status, admin_reply, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tickets: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
