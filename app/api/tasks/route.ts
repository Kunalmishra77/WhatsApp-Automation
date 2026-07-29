import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { validateTaskInput } from '@/lib/tasks';

const SELECT = `
  id, workspace_id, title, description, status, priority, due_date, completed_at,
  assigned_to, created_by, related_contact_id, related_conversation_id, created_at, updated_at,
  assignee:profiles!tasks_assigned_to_fkey(full_name, email),
  creator:profiles!tasks_created_by_fkey(full_name, email),
  contact:contacts(name, phone)
`;

// GET /api/tasks?workspaceId=&status=&assignedTo=
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    let q = db.from('tasks').select(SELECT).eq('workspace_id', workspaceId)
      .order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    const status = sp.get('status');
    const assignedTo = sp.get('assignedTo');
    if (status) q = q.eq('status', status);
    if (assignedTo) q = q.eq('assigned_to', assignedTo);

    const { data, error } = await q;
    if (error) { console.error('[Tasks GET]', error); return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 }); }
    return NextResponse.json({ tasks: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, title, description, assigned_to, priority, due_date, related_contact_id, related_conversation_id } = body;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const ctx = await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const err = validateTaskInput({ title, priority });
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const db = createAdminClient() as any;
    const { data: task, error } = await db.from('tasks').insert({
      workspace_id: workspaceId,
      title: String(title).trim(),
      description: description ?? null,
      assigned_to: assigned_to ?? null,
      created_by: ctx.userId,
      priority: priority ?? 'medium',
      due_date: due_date ?? null,
      related_contact_id: related_contact_id ?? null,
      related_conversation_id: related_conversation_id ?? null,
    }).select(SELECT).single();
    if (error) { console.error('[Tasks POST]', error); return NextResponse.json({ error: 'Failed to create task' }, { status: 500 }); }

    // Notify the assignee (unless self-assigned).
    if (assigned_to && assigned_to !== ctx.userId) {
      await db.from('notifications').insert({
        workspace_id: workspaceId, user_id: assigned_to, type: 'task_assigned',
        title: 'New task assigned', body: String(title).trim(),
        data: { task_id: task.id }, created_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
