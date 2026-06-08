# Vector Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vector document store (RAG) to the Agentix WhatsApp CRM — file upload, auto-chunking, vectorization, a full-page KB manager with drag-drop upload and a Vector Sandbox, plus webhook integration to use vector docs in AI replies.

**Architecture:** New `vector_documents` table stores text chunks with `vector(1536)` embeddings alongside the existing `knowledge_base` Q&A table. A new `/api/vector-kb/*` route set handles upload/chunking/search. A new full-page `/knowledge-base` replaces the thin wrapper (keeping the settings KB component intact for the settings page).

**Tech Stack:** Next.js 14 App Router, Supabase + pgvector, OpenAI text-embedding-3-small via `lib/embeddings.ts`, shadcn/ui, Tailwind, Sonner toasts, Zustand workspace store.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `database/migrations/023_vector_documents.sql` | Table + indexes + two RPCs |
| Create | `app/api/vector-kb/upload/route.ts` | Multipart file upload → chunk → embed → insert |
| Create | `app/api/vector-kb/route.ts` | List documents grouped by filename; DELETE by filename |
| Create | `app/api/vector-kb/search/route.ts` | Semantic search via RPC with ILIKE fallback |
| Replace | `app/(dashboard)/knowledge-base/page.tsx` | Full-page KB manager with Documents + Sandbox tabs |
| Modify | `app/api/webhooks/whatsapp/route.ts` | Augment `fetchKnowledgeBaseContext` with vector docs |

---

### Task 1: DB Migration 023 — vector_documents table + RPCs

**Files:**
- Create: `database/migrations/023_vector_documents.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 023: Vector Documents — chunked file storage for RAG

CREATE TABLE IF NOT EXISTS vector_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename      VARCHAR(500) NOT NULL,
  file_type     VARCHAR(50),
  chunk_index   INTEGER NOT NULL DEFAULT 0,
  content       TEXT NOT NULL,
  embedding     vector(1536),
  char_count    INTEGER GENERATED ALWAYS AS (length(content)) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vd_workspace_idx ON vector_documents (workspace_id);
CREATE INDEX IF NOT EXISTS vd_filename_idx  ON vector_documents (workspace_id, filename);
CREATE INDEX IF NOT EXISTS vd_embedding_idx ON vector_documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RPC: vector similarity search over vector_documents
CREATE OR REPLACE FUNCTION match_vector_documents(
  query_embedding vector(1536),
  workspace_id_param UUID,
  match_count INT DEFAULT 5,
  min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  filename VARCHAR,
  chunk_index INTEGER,
  content TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    id,
    filename,
    chunk_index,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM vector_documents
  WHERE workspace_id = workspace_id_param
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RPC: vector similarity search over knowledge_base Q&A entries
CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(1536),
  workspace_id_param UUID,
  match_count INT DEFAULT 5
)
RETURNS TABLE (title TEXT, content TEXT, similarity FLOAT)
LANGUAGE SQL STABLE AS $$
  SELECT
    title,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE workspace_id = workspace_id_param
    AND is_active = true
    AND is_draft = false
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

Save this as `database/migrations/023_vector_documents.sql`.

- [ ] **Step 2: Run migration in Supabase**

In the Supabase Dashboard → SQL Editor, paste and run the contents of `database/migrations/023_vector_documents.sql`.

Expected: no errors; `vector_documents` table appears in Table Editor.

- [ ] **Step 3: Commit migration**

```bash
git add database/migrations/023_vector_documents.sql
git commit -m "feat: add vector_documents table and match RPCs (migration 023)"
```

---

### Task 2: Upload + Chunking API

**Files:**
- Create: `app/api/vector-kb/upload/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';
import { generateEmbedding, formatEmbedding } from '@/lib/embeddings';

const ALLOWED_TYPES = ['txt', 'md', 'csv', 'json', 'pdf'];

function getFileExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function stripBinary(text: string): string {
  // Remove non-printable characters that come from binary PDF sections
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ').replace(/\s{3,}/g, ' ').trim();
}

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + chunkSize).trim();
    if (chunk.length > 20) chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    const workspaceId = form.get('workspaceId') as string | null;

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'file and workspaceId are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const ext = getFileExt(file.name);
    if (!ALLOWED_TYPES.includes(ext)) {
      return NextResponse.json(
        { error: `File type .${ext} is not supported. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    // Read file as text — for PDF this is best-effort text extraction
    const rawText = await file.text();
    const text = stripBinary(rawText);

    if (!text || text.length < 20) {
      return NextResponse.json({ error: 'File appears to be empty or unreadable' }, { status: 400 });
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No usable text chunks extracted from file' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // Delete any existing chunks for this filename+workspace (re-upload replaces)
    await db
      .from('vector_documents')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('filename', file.name);

    // Process chunks sequentially to avoid rate-limiting OpenAI
    let chunksCreated = 0;
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx]!;
      const embeddingVec = await generateEmbedding(chunk);
      const row: Record<string, unknown> = {
        workspace_id: workspaceId,
        filename: file.name,
        file_type: ext,
        chunk_index: idx,
        content: chunk,
      };
      if (embeddingVec) row.embedding = formatEmbedding(embeddingVec);

      const { error } = await db.from('vector_documents').insert(row);
      if (!error) chunksCreated++;
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      chunks_created: chunksCreated,
    });
  } catch (error) {
    return authzResponse(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/vector-kb/upload/route.ts
git commit -m "feat: add vector-kb upload API — file → chunk → embed → store"
```

---

### Task 3: Vector Documents List + Delete API

**Files:**
- Create: `app/api/vector-kb/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';

// GET /api/vector-kb?workspaceId=xxx
// Returns documents grouped by filename with chunk count and first created_at
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('vector_documents')
      .select('filename, file_type, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by filename
    const grouped = new Map<string, { filename: string; file_type: string; chunks: number; created_at: string }>();
    for (const row of (data ?? []) as Array<{ filename: string; file_type: string; created_at: string }>) {
      if (grouped.has(row.filename)) {
        grouped.get(row.filename)!.chunks++;
      } else {
        grouped.set(row.filename, {
          filename: row.filename,
          file_type: row.file_type ?? '',
          chunks: 1,
          created_at: row.created_at,
        });
      }
    }

    return NextResponse.json({ documents: Array.from(grouped.values()) });
  } catch (error) {
    return authzResponse(error);
  }
}

// DELETE /api/vector-kb?workspaceId=xxx&filename=xxx
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const filename = request.nextUrl.searchParams.get('filename');

    if (!workspaceId || !filename) {
      return NextResponse.json({ error: 'workspaceId and filename are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { error } = await db
      .from('vector_documents')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('filename', filename);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return authzResponse(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/vector-kb/route.ts
git commit -m "feat: add vector-kb list and delete API"
```

---

### Task 4: Vector Sandbox Search API

**Files:**
- Create: `app/api/vector-kb/search/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';
import { generateEmbedding, formatEmbedding } from '@/lib/embeddings';

// POST /api/vector-kb/search
// Body: { workspaceId: string, query: string, limit?: number }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, query, limit = 5 } = await request.json() as {
      workspaceId?: string;
      query?: string;
      limit?: number;
    };

    if (!workspaceId || !query?.trim()) {
      return NextResponse.json({ error: 'workspaceId and query are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;

    // Try vector search
    const embeddingVec = await generateEmbedding(query.trim());
    if (embeddingVec) {
      try {
        const { data: rpcResults, error: rpcError } = await db.rpc('match_vector_documents', {
          query_embedding: formatEmbedding(embeddingVec),
          workspace_id_param: workspaceId,
          match_count: limit,
          min_similarity: 0.1,
        });

        if (!rpcError && rpcResults && (rpcResults as unknown[]).length > 0) {
          const results = (rpcResults as Array<{
            id: string;
            filename: string;
            chunk_index: number;
            content: string;
            similarity: number;
          }>).map((r) => ({
            id: r.id,
            filename: r.filename,
            chunk_index: r.chunk_index,
            content: r.content,
            similarity: r.similarity,
            similarity_pct: `${(r.similarity * 100).toFixed(1)}%`,
          }));

          return NextResponse.json({ results, query, total: results.length, method: 'vector' });
        }
      } catch {
        // RPC not available — fall through to ILIKE
      }
    }

    // Fallback: ILIKE keyword search
    const words = query.trim().split(/\s+/).filter((w) => w.length > 2);
    const searchTerm = words.length > 0 ? `%${words[0]}%` : `%${query.trim()}%`;
    const { data: likeResults, error: likeError } = await db
      .from('vector_documents')
      .select('id, filename, chunk_index, content')
      .eq('workspace_id', workspaceId)
      .ilike('content', searchTerm)
      .limit(limit);

    if (likeError) return NextResponse.json({ error: likeError.message }, { status: 500 });

    const results = ((likeResults ?? []) as Array<{
      id: string;
      filename: string;
      chunk_index: number;
      content: string;
    }>).map((r) => ({
      id: r.id,
      filename: r.filename,
      chunk_index: r.chunk_index,
      content: r.content,
      similarity: 0,
      similarity_pct: 'keyword',
    }));

    return NextResponse.json({ results, query, total: results.length, method: 'keyword' });
  } catch (error) {
    return authzResponse(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/vector-kb/search/route.ts
git commit -m "feat: add vector-kb search API with vector+ILIKE fallback"
```

---

### Task 5: Full Knowledge Base Page

**Files:**
- Replace: `app/(dashboard)/knowledge-base/page.tsx`

The page is a client component with two tabs: **Documents** (upload + list) and **Vector Sandbox** (search). The existing settings `KnowledgeBase` component at `modules/settings/components/KnowledgeBase/` is NOT used here — this page stands alone with its own fresh UI for vector documents.

- [ ] **Step 1: Replace the page file**

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  FileText, Upload, Search, Trash2, Loader2, Database, FlaskConical,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VectorDocument {
  filename: string;
  file_type: string;
  chunks: number;
  created_at: string;
}

interface SearchResult {
  id: string;
  filename: string;
  chunk_index: number;
  content: string;
  similarity: number;
  similarity_pct: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function similarityColor(sim: number): string {
  if (sim >= 0.7) return 'text-green-600 bg-green-50 border-green-200';
  if (sim >= 0.5) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function similarityBarColor(sim: number): string {
  if (sim >= 0.7) return 'bg-green-500';
  if (sim >= 0.5) return 'bg-yellow-500';
  return 'bg-red-500';
}

function fileIcon(fileType: string): string {
  const icons: Record<string, string> = {
    pdf: '📄', txt: '📝', md: '📋', csv: '📊', json: '📦',
  };
  return icons[fileType] ?? '📄';
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

interface DocumentsTabProps {
  workspaceId: string;
}

function DocumentsTab({ workspaceId }: DocumentsTabProps) {
  const [documents, setDocuments] = useState<VectorDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<
    'idle' | 'uploading' | 'processing' | 'done' | 'error'
  >('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/vector-kb?workspaceId=${workspaceId}`);
      const data = await res.json() as { documents?: VectorDocument[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setDocuments(data.documents ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchDocuments(); }, [fetchDocuments]);

  const uploadFile = async (file: File) => {
    setUploadState('uploading');
    setUploadMessage(`Uploading ${file.name}...`);

    const form = new FormData();
    form.append('file', file);
    form.append('workspaceId', workspaceId);

    try {
      setUploadState('processing');
      setUploadMessage('Processing chunks and generating embeddings...');

      const res = await fetch('/api/vector-kb/upload', { method: 'POST', body: form });
      const data = await res.json() as { chunks_created?: number; filename?: string; error?: string };

      if (!res.ok) throw new Error(data.error ?? 'Upload failed');

      setUploadState('done');
      setUploadMessage(`Done: ${data.chunks_created ?? 0} chunks created from ${data.filename ?? file.name}`);
      toast.success(`${data.filename} uploaded — ${data.chunks_created} chunks vectorized`);
      void fetchDocuments();

      setTimeout(() => {
        setUploadState('idle');
        setUploadMessage('');
      }, 4000);
    } catch (err) {
      setUploadState('error');
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed');
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete all chunks for "${filename}"?`)) return;
    try {
      const res = await fetch(
        `/api/vector-kb?workspaceId=${workspaceId}&filename=${encodeURIComponent(filename)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Delete failed');
      toast.success(`${filename} deleted`);
      setDocuments((prev) => prev.filter((d) => d.filename !== filename));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const isUploading = uploadState === 'uploading' || uploadState === 'processing';

  return (
    <div className="space-y-6">
      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-border hover:border-brand-400 hover:bg-muted/30',
          isUploading && 'cursor-not-allowed opacity-70',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.csv,.json,.pdf"
          className="hidden"
          onChange={handleFileInput}
          disabled={isUploading}
        />

        {uploadState === 'idle' && (
          <>
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Drop a file here or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports .txt, .md, .csv, .json, .pdf — auto-chunked into 500-char segments
            </p>
          </>
        )}

        {(uploadState === 'uploading' || uploadState === 'processing') && (
          <>
            <Loader2 className="h-10 w-10 mx-auto mb-3 text-brand-500 animate-spin" />
            <p className="text-sm font-medium text-brand-600">{uploadMessage}</p>
            <p className="text-xs text-muted-foreground mt-1">This may take a moment for large files...</p>
          </>
        )}

        {uploadState === 'done' && (
          <>
            <div className="h-10 w-10 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-600 text-lg font-bold">✓</span>
            </div>
            <p className="text-sm font-medium text-green-600">{uploadMessage}</p>
          </>
        )}

        {uploadState === 'error' && (
          <>
            <div className="h-10 w-10 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-600 text-lg font-bold">✗</span>
            </div>
            <p className="text-sm font-medium text-red-600">{uploadMessage}</p>
          </>
        )}
      </div>

      {/* Document List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents uploaded yet.</p>
          <p className="text-xs mt-1">Upload a file above to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </p>
          {documents.map((doc) => (
            <div
              key={doc.filename}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl flex-shrink-0">{fileIcon(doc.file_type)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.chunks} chunk{doc.chunks !== 1 ? 's' : ''} · {formatDate(doc.created_at)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => void handleDelete(doc.filename)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Vector Sandbox Tab ───────────────────────────────────────────────────────

interface SandboxTabProps {
  workspaceId: string;
}

function SandboxTab({ workspaceId }: SandboxTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [method, setMethod] = useState<string>('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearched(false);
    try {
      const res = await fetch('/api/vector-kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, query: query.trim(), limit: 8 }),
      });
      const data = await res.json() as {
        results?: SearchResult[];
        method?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setResults(data.results ?? []);
      setMethod(data.method ?? '');
      setSearched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) void handleSearch();
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="rounded-lg bg-muted/40 border p-4">
        <p className="text-sm text-muted-foreground">
          Test semantic search against your uploaded documents. Enter any query to see which
          chunks your AI bot would retrieve, along with similarity percentages.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <Input
          placeholder="e.g. What is your return policy?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
          disabled={isSearching}
        />
        <Button onClick={() => void handleSearch()} disabled={isSearching || !query.trim()}>
          {isSearching ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching...</>
          ) : (
            <><Search className="h-4 w-4 mr-2" />Search Vectors</>
          )}
        </Button>
      </div>

      {/* Results */}
      {searched && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{query}&quot;
            </p>
            {method && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full border font-medium',
                method === 'vector'
                  ? 'text-brand-600 bg-brand-50 border-brand-200'
                  : 'text-muted-foreground bg-muted border-border',
              )}>
                {method === 'vector' ? 'Semantic' : 'Keyword'} search
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border rounded-lg">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No results found.</p>
              <p className="text-xs mt-1">Try a different query or upload relevant documents.</p>
            </div>
          ) : (
            results.map((result) => (
              <div key={result.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{result.filename}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      chunk #{result.chunk_index + 1}
                    </span>
                  </div>
                  {result.similarity > 0 && (
                    <span className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0',
                      similarityColor(result.similarity),
                    )}>
                      {result.similarity_pct} match
                    </span>
                  )}
                  {result.similarity_pct === 'keyword' && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded border text-muted-foreground bg-muted border-border flex-shrink-0">
                      keyword match
                    </span>
                  )}
                </div>

                {/* Similarity bar */}
                {result.similarity > 0 && (
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', similarityBarColor(result.similarity))}
                      style={{ width: `${Math.min(result.similarity * 100, 100)}%` }}
                    />
                  </div>
                )}

                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                  {result.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  if (!workspaceId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2.5">
          <Database className="h-6 w-6 text-brand-500" />
          Knowledge Base
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload documents for RAG — your AI bot uses these as context when answering customer questions.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="documents">
        <TabsList className="mb-6">
          <TabsTrigger value="documents" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="sandbox" className="gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            Vector Sandbox
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <DocumentsTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="sandbox">
          <SandboxTab workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/knowledge-base/page.tsx
git commit -m "feat: replace knowledge-base page with vector doc manager + sandbox"
```

---

### Task 6: Update fetchKnowledgeBaseContext in webhook

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts` — lines 678–741

The existing function tries `match_knowledge_base` RPC then falls back to keyword search over the `knowledge_base` table. We add vector document search BEFORE the existing logic, combining results when both yield data.

- [ ] **Step 1: Read the current function** (already done in planning — lines 678–741)

Locate the block starting `async function fetchKnowledgeBaseContext(` and replace the entire body.

- [ ] **Step 2: Replace the function body**

Find this exact block in `app/api/webhooks/whatsapp/route.ts`:

```typescript
async function fetchKnowledgeBaseContext(
  supabase: AdminClient,
  workspaceId: string,
  query: string,
): Promise<string> {
  try {
    const db = supabase as any;

    // Try semantic vector search first (pgvector)
    try {
      const { generateEmbedding, formatEmbedding } = await import('@/lib/embeddings');
      const queryEmbedding = await generateEmbedding(query);
      if (queryEmbedding) {
        const { data: vecResults } = await db.rpc('match_knowledge_base', {
          query_embedding: formatEmbedding(queryEmbedding),
          workspace_id_param: workspaceId,
          match_count: 5,
        });
        if (vecResults?.length > 0) {
          return (vecResults as Array<{ title: string; content: string }>)
            .map((e) => `## ${e.title}\n${e.content}`)
            .join('\n\n');
        }
      }
    } catch {
      // pgvector function not yet created — fall through to keyword search
    }

    // Fallback: keyword scoring
    const { data: entries } = await db
      .from('knowledge_base')
      .select('title, content, tags, priority')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .eq('is_draft', false)
      .order('priority', { ascending: false })
      .limit(20);

    if (!entries || entries.length === 0) return '';

    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const scored = (entries as Array<{ title: string; content: string; tags?: string[]; priority?: number }>).map((e) => {
      const titleLower = e.title.toLowerCase();
      const contentLower = e.content.toLowerCase();
      const tagsText = (e.tags ?? []).join(' ').toLowerCase();
      let score = (e.priority ?? 0) * 0.1;
      for (const w of queryWords) {
        if (titleLower.includes(w)) score += 3;
        else if (tagsText.includes(w)) score += 2;
        else if (contentLower.includes(w)) score += 1;
      }
      return { title: e.title, content: e.content, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter((e) => e.score > 0 || entries.length <= 5)
      .map((e) => `## ${e.title}\n${e.content}`)
      .join('\n\n');
  } catch {
    return '';
  }
}
```

Replace it with:

```typescript
async function fetchKnowledgeBaseContext(
  supabase: AdminClient,
  workspaceId: string,
  query: string,
): Promise<string> {
  try {
    const db = supabase as any;

    const { generateEmbedding, formatEmbedding } = await import('@/lib/embeddings');
    const queryEmbedding = await generateEmbedding(query);

    let vectorDocContext = '';
    let kbContext = '';

    // 1. Try vector_documents semantic search (RAG file store)
    if (queryEmbedding) {
      try {
        const { data: vectorDocResults } = await db.rpc('match_vector_documents', {
          query_embedding: formatEmbedding(queryEmbedding),
          workspace_id_param: workspaceId,
          match_count: 3,
          min_similarity: 0.3,
        });
        if (vectorDocResults?.length > 0) {
          vectorDocContext = (vectorDocResults as Array<{ filename: string; content: string }>)
            .map((r) => `[${r.filename}] ${r.content}`)
            .join('\n\n');
        }
      } catch {
        // match_vector_documents RPC not yet available — skip silently
      }
    }

    // 2. Try knowledge_base Q&A semantic search
    if (queryEmbedding) {
      try {
        const { data: kbVecResults } = await db.rpc('match_knowledge_base', {
          query_embedding: formatEmbedding(queryEmbedding),
          workspace_id_param: workspaceId,
          match_count: 5,
        });
        if (kbVecResults?.length > 0) {
          kbContext = (kbVecResults as Array<{ title: string; content: string }>)
            .map((e) => `## ${e.title}\n${e.content}`)
            .join('\n\n');
        }
      } catch {
        // match_knowledge_base RPC not yet available — fall through to keyword search
      }
    }

    // 3. Keyword fallback for knowledge_base if vector search yielded nothing
    if (!kbContext) {
      const { data: entries } = await db
        .from('knowledge_base')
        .select('title, content, tags, priority')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
        .eq('is_draft', false)
        .order('priority', { ascending: false })
        .limit(20);

      if (entries && entries.length > 0) {
        const queryWords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        const scored = (entries as Array<{ title: string; content: string; tags?: string[]; priority?: number }>).map((e) => {
          const titleLower = e.title.toLowerCase();
          const contentLower = e.content.toLowerCase();
          const tagsText = (e.tags ?? []).join(' ').toLowerCase();
          let score = (e.priority ?? 0) * 0.1;
          for (const w of queryWords) {
            if (titleLower.includes(w)) score += 3;
            else if (tagsText.includes(w)) score += 2;
            else if (contentLower.includes(w)) score += 1;
          }
          return { title: e.title, content: e.content, score };
        });
        kbContext = scored
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .filter((e) => e.score > 0 || entries.length <= 5)
          .map((e) => `## ${e.title}\n${e.content}`)
          .join('\n\n');
      }
    }

    // Combine: vector doc RAG first, then Q&A KB
    const parts = [vectorDocContext, kbContext].filter(Boolean);
    return parts.join('\n\n---\n\n');
  } catch {
    return '';
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/whatsapp/route.ts
git commit -m "feat: augment webhook KB context with vector_documents RAG search"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| DB migration 023 — vector_documents table | Task 1 |
| DB migration 023 — match_vector_documents RPC | Task 1 |
| DB migration 023 — match_knowledge_base RPC | Task 1 |
| Upload API: multipart, chunk, embed, insert | Task 2 |
| Upload API: re-upload replaces existing | Task 2 |
| List API: grouped by filename with chunk count | Task 3 |
| Delete API: by filename | Task 3 |
| Search API: vector with ILIKE fallback | Task 4 |
| Search API: similarity_pct formatting | Task 4 |
| KB page: Documents tab with drag-drop upload | Task 5 |
| KB page: upload progress states | Task 5 |
| KB page: document list with delete | Task 5 |
| KB page: Vector Sandbox tab with query input | Task 5 |
| KB page: similarity bars (green/yellow/red) | Task 5 |
| Webhook: augment with vector_documents search | Task 6 |
| Keep settings KB component unchanged | No changes to modules/settings/components/KnowledgeBase/ |

### Placeholder Scan

No TBD/TODO/placeholder language found. All code blocks are complete and self-contained.

### Type Consistency

- `VectorDocument` defined in Task 5 matches the shape returned by GET `/api/vector-kb` (Task 3)
- `SearchResult` in Task 5 matches the shape returned by POST `/api/vector-kb/search` (Task 4)
- `chunkText` defined in Task 2, not referenced elsewhere
- `formatEmbedding`/`generateEmbedding` imported from `@/lib/embeddings` consistently in Tasks 2, 4, 6
- `requireWorkspacePermission`/`authzResponse` from `@/lib/authz` used consistently in Tasks 2, 3, 4

All types and imports are consistent.
