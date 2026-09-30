import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const runtime = 'nodejs';

const SELECT = `
  id, type, body, meta, created_at,
  actor:profiles!task_activity_actor_id_fkey(full_name, email)
`;

// GET /api/tasks/[id]/activity — full activity/comment history for a task.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: task } = await db.from('tasks').select('workspace_id').eq('id', id).single();
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    await requireWorkspacePermission(task.workspace_id, 'handle_conversations');

    const { data, error } = await db
      .from('task_activity')
      .select(SELECT)
      .eq('task_id', id)
      .order('created_at', { ascending: true });
    if (error) { console.error('[TaskActivity GET]', error); return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 }); }
    return NextResponse.json({ activity: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/activity  Body: { body }  — add a comment/update to a task.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { body } = await request.json() as { body?: string };
    if (!body?.trim()) return NextResponse.json({ error: 'Comment is empty' }, { status: 400 });

    const db = createAdminClient() as any;
    const { data: task } = await db.from('tasks').select('workspace_id').eq('id', id).single();
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const ctx = await requireWorkspacePermission(task.workspace_id, 'handle_conversations');

    const { data, error } = await db.from('task_activity').insert({
      workspace_id: task.workspace_id,
      task_id: id,
      actor_id: ctx.userId,
      type: 'comment',
      body: body.trim(),
    }).select(SELECT).single();
    if (error) { console.error('[TaskActivity POST]', error); return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 }); }

    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
