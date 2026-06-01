BEGIN;

-- Extend existing knowledge_base table with enterprise fields
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS tags         TEXT[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source       VARCHAR(50)  DEFAULT 'manual',
  -- source: 'manual' | 'file' | 'ai' | 'template'
  ADD COLUMN IF NOT EXISTS source_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_draft     BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority     INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS char_count   INTEGER      GENERATED ALWAYS AS (char_length(content)) STORED;

CREATE INDEX IF NOT EXISTS idx_kb_priority ON public.knowledge_base(workspace_id, priority DESC, is_active);

COMMIT;
