-- 023: Vector Documents — chunked file storage for RAG

-- ── Vector Documents Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vector_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename      VARCHAR(500) NOT NULL,
  file_type     VARCHAR(50),
  chunk_index   INTEGER     NOT NULL DEFAULT 0,
  content       TEXT        NOT NULL,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vd_workspace_idx ON vector_documents (workspace_id);
CREATE INDEX IF NOT EXISTS vd_embedding_idx ON vector_documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── match_vector_documents RPC ────────────────────────────────────────────────
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

-- ── match_knowledge_base RPC (fixes missing function) ────────────────────────
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
