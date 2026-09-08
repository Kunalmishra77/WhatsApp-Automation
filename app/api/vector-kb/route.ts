import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/vector-kb?workspaceId=xxx  — list documents grouped by filename
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;

    // Get grouped counts — paginate: a single large KB file can produce thousands of
    // chunks, so an unbounded select would drop files/chunks past PostgREST's 1000-row cap.
    const data: Array<{ filename: string; file_type: string | null; chunk_index: number; created_at: string }> = [];
    let vkOff = 0;
    while (true) {
      const { data: pg, error } = await db
        .from('vector_documents')
        .select('filename, file_type, chunk_index, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .range(vkOff, vkOff + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!pg?.length) break;
      data.push(...(pg as typeof data));
      if (pg.length < 1000) break;
      vkOff += 1000;
    }

    // Group by filename
    const grouped: Record<string, { filename: string; file_type: string; chunks: number; created_at: string }> = {};
    for (const row of (data ?? [])) {
      if (!grouped[row.filename]) {
        grouped[row.filename] = {
          filename: row.filename,
          file_type: row.file_type ?? '',
          chunks: 0,
          created_at: row.created_at,
        };
      }
      grouped[row.filename]!.chunks += 1;
    }

    return NextResponse.json({ documents: Object.values(grouped) });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/vector-kb?workspaceId=xxx&filename=xxx
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const filename = request.nextUrl.searchParams.get('filename');
    if (!workspaceId || !filename) {
      return NextResponse.json({ error: 'workspaceId and filename required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    await db.from('vector_documents').delete()
      .eq('workspace_id', workspaceId)
      .eq('filename', filename);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
