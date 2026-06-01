import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

interface BulkEntry {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  source?: string;
  sourceFilename?: string;
  priority?: number;
}

// POST /api/knowledge-base/bulk
// Body: { workspaceId, entries[], source, sourceFilename }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, entries, source = 'manual', sourceFilename } = await request.json() as {
      workspaceId?: string;
      entries?: BulkEntry[];
      source?: string;
      sourceFilename?: string;
    };

    if (!workspaceId || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'workspaceId and entries[] are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;

    const rows = entries.map((e, i) => ({
      workspace_id:    workspaceId,
      title:           e.title?.trim(),
      content:         e.content?.trim(),
      category:        e.category ?? 'general',
      tags:            e.tags ?? [],
      source,
      source_filename: sourceFilename ?? e.sourceFilename ?? null,
      priority:        e.priority ?? (entries.length - i), // first entries = higher priority
      is_active:       true,
      is_draft:        false,
    })).filter((r) => r.title && r.content);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid entries to insert' }, { status: 400 });
    }

    const { data, error } = await db
      .from('knowledge_base')
      .insert(rows)
      .select('id, title');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ inserted: data?.length ?? 0, entries: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
