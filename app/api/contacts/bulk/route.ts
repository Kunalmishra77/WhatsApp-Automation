import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// DELETE /api/contacts/bulk  body: { workspaceId, ids: string[] }
export async function DELETE(request: NextRequest) {
  try {
    const { workspaceId, ids } = await request.json() as { workspaceId?: string; ids?: string[] };
    if (!workspaceId || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'workspaceId and ids[] required' }, { status: 400 });
    }
    await requireWorkspacePermission(workspaceId, 'manage_contacts');
    const db = createAdminClient() as any;
    const { error } = await db.from('contacts').delete().in('id', ids).eq('workspace_id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: ids.length });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Contacts Bulk Delete]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/contacts/bulk?workspaceId=&search=&listId=  — returns contacts for CSV export
export async function GET(request: NextRequest) {
  try {
    const sp          = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    const listId      = sp.get('listId') ?? '';
    const search      = sp.get('search') ?? '';
    if (!workspaceId && !listId) return NextResponse.json({ error: 'workspaceId or listId required' }, { status: 400 });

    const db = createAdminClient() as any;

    // When only listId is provided, derive workspaceId from the list record
    let effectiveWorkspaceId = workspaceId;
    if (!effectiveWorkspaceId && listId) {
      const { data: list } = await db.from('contact_lists').select('workspace_id').eq('id', listId).single();
      effectiveWorkspaceId = list?.workspace_id;
    }
    if (!effectiveWorkspaceId) return NextResponse.json({ error: 'workspace not found' }, { status: 404 });

    await requireWorkspacePermission(effectiveWorkspaceId, 'manage_contacts');

    const selectExpr = listId
      ? 'id, name, phone, email, company, tags, created_at, contact_list_members!inner(list_id)'
      : 'id, name, phone, email, company, tags, created_at';

    let allRows: Array<Record<string, unknown>> = [];
    let offset = 0;
    const CHUNK = 1000;
    while (true) {
      let q = db
        .from('contacts')
        .select(selectExpr)
        .eq('workspace_id', effectiveWorkspaceId)
        .order('created_at', { ascending: false })
        .range(offset, offset + CHUNK - 1);
      if (listId) q = q.eq('contact_list_members.list_id', listId);
      if (search.trim()) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      const { data: chunk } = await q;
      if (!chunk || chunk.length === 0) break;
      allRows = allRows.concat(chunk as Array<Record<string, unknown>>);
      if (chunk.length < CHUNK) break;
      offset += CHUNK;
    }

    const header = 'Name,Phone,Email,Company,Tags,Added\n';
    const rows = allRows.map((c) => [
      csvCell(c.name as string ?? ''),
      csvCell(c.phone as string ?? ''),
      csvCell(c.email as string ?? ''),
      csvCell(c.company as string ?? ''),
      csvCell(Array.isArray(c.tags) ? (c.tags as string[]).join(';') : ''),
      csvCell(c.created_at ? new Date(c.created_at as string).toLocaleDateString('en-IN') : ''),
    ].join(',')).join('\n');

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="contacts.csv"',
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function csvCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
