import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { generateEmbedding, formatEmbedding } from '@/lib/embeddings';

interface SearchResult {
  id: string;
  filename: string;
  chunk_index: number;
  content: string;
  similarity: number;
  similarity_pct: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { workspaceId?: string; query?: string; limit?: number };
    const { workspaceId, query, limit = 5 } = body;

    if (!workspaceId || !query) {
      return NextResponse.json({ error: 'workspaceId and query required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    let results: SearchResult[] = [];

    // Try semantic search first
    const embedding = await generateEmbedding(query);
    if (embedding) {
      const { data: vecResults } = await db.rpc('match_vector_documents', {
        query_embedding: formatEmbedding(embedding),
        workspace_id_param: workspaceId,
        match_count: limit,
        min_similarity: 0.2,
      }).catch(() => ({ data: null }));

      if (vecResults?.length) {
        results = (vecResults as any[]).map((r) => ({
          id: r.id,
          filename: r.filename,
          chunk_index: r.chunk_index,
          content: r.content,
          similarity: r.similarity,
          similarity_pct: `${(r.similarity * 100).toFixed(1)}%`,
        }));
      }
    }

    // Fallback: ILIKE keyword search
    if (results.length === 0) {
      const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const searchPattern = keywords[0] ? `%${keywords[0]}%` : `%${query}%`;
      const { data: fallback } = await db
        .from('vector_documents')
        .select('id, filename, chunk_index, content')
        .eq('workspace_id', workspaceId)
        .ilike('content', searchPattern)
        .limit(limit);

      results = (fallback ?? []).map((r: any) => ({
        id: r.id,
        filename: r.filename,
        chunk_index: r.chunk_index,
        content: r.content,
        similarity: 0,
        similarity_pct: 'Keyword match',
      }));
    }

    return NextResponse.json({ results, query, total: results.length });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[VectorKB Search]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
