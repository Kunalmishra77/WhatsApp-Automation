import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { validateTaskInput, completedAtForStatus } from '@/lib/tasks';

// PATCH /api/tasks/[id]  — update status / assignee / fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = createAdminClient() as any;

    const { data: existing } = await db.from('tasks').select('workspace_id, assigned_to').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const ctx = await requireWorkspacePermission(existing.workspace_id, 'handle_conversations');

    const err = validateTaskInput({ title: body.title, priority: body.priority, status: body.status });
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ['title', 'description', 'assigned_to', 'priority', 'due_date'] as const) {
      if (body[k] !== undefined) patch[k] = k === 'title' ? String(body[k]).trim() : body[k];
    }
    if (body.status !== undefined) {
      patch.status = body.status;
      patch.completed_at = completedAtForStatus(body.status, new Date().toISOString());
    }

    const { data: task, error } = await db.from('tasks').update(patch).eq('id', id).select('*').single();
    if (error) { console.error('[Tasks PATCH]', error); return NextResponse.json({ error: 'Failed to update task' }, { status: 500 }); }

    // Notify on (re)assignment to someone new (and not self).
    if (body.assigned_to && body.assigned_to !== existing.assigned_to && body.assigned_to !== ctx.userId) {
      await db.from('notifications').insert({
        workspace_id: existing.workspace_id, user_id: body.assigned_to, type: 'task_assigned',
        title: 'Task assigned to you', body: task.title, data: { task_id: id }, created_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: existing } = await db.from('tasks').select('workspace_id').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    await requireWorkspacePermission(existing.workspace_id, 'handle_conversations');

    const { error } = await db.from('tasks').delete().eq('id', id);
    if (error) return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
