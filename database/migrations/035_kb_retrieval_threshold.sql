-- 035: Add relevance threshold to match_knowledge_base — it previously had none,
-- so it always returned the top 5 nearest entries even when completely unrelated
-- to the query, polluting the AI agent's context with irrelevant facts.

CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(1536),
  workspace_id_param UUID,
  match_count INT DEFAULT 5,
  min_similarity FLOAT DEFAULT 0.45
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
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
