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
      try {
        const { data: vecResults, error: rpcErr } = await db.rpc('match_vector_documents', {
          query_embedding: formatEmbedding(embedding),
          workspace_id_param: workspaceId,
          match_count: limit,
          min_similarity: 0.2,
        });
        if (!rpcErr && vecResults?.length) {
          results = (vecResults as any[]).map((r) => ({
            id: r.id,
            filename: r.filename,
            chunk_index: r.chunk_index,
            content: r.content,
            similarity: r.similarity,
            similarity_pct: `${(r.similarity * 100).toFixed(1)}%`,
          }));
        }
      } catch {
        // RPC unavailable — fall through to keyword search
      }
    }

    // Fallback: ILIKE keyword search
    if (results.length === 0) {
      const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const searchPattern = keywords[0] ? `%${keywords[0]}%` : `%${query}%`;
      try {
        const { data: fallback, error: fallbackErr } = await db
          .from('vector_documents')
          .select('id, filename, chunk_index, content')
          .eq('workspace_id', workspaceId)
          .ilike('content', searchPattern)
          .limit(limit);
        if (fallbackErr) throw new Error(fallbackErr.message);
        results = (fallback ?? []).map((r: any) => ({
          id: r.id,
          filename: r.filename,
          chunk_index: r.chunk_index,
          content: r.content,
          similarity: 0,
          similarity_pct: 'Keyword match',
        }));
      } catch (fbErr) {
        throw new Error(`vector_documents table missing — run migration 023 in Supabase. (${fbErr instanceof Error ? fbErr.message : String(fbErr)})`);
      }
    }

    return NextResponse.json({ results, query, total: results.length });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[VectorKB Search]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
