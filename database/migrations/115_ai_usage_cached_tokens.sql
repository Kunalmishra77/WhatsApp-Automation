-- 115 — Track cached input tokens so prompt-cache savings are measurable.
--
-- auto_reply is 66% of all AI spend ($10.42 of $15.92 over 14 days) and averages
-- 14,131 input tokens to produce a 64-token answer, because each reply ships the
-- whole persona plus retrieved knowledge base. Razorveda averages 23,656.
--
-- OpenAI bills cached input tokens at half price, and caches the longest common
-- PREFIX of a prompt — but our system prompt put the per-question knowledge-base
-- block before the stable persona, so no two prompts shared a prefix and the cache
-- never hit (`cached_tokens: 0`). With the prompt reordered, this column is how we
-- confirm the cache is actually working rather than assuming it.
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_usage.cached_tokens IS
  'Input tokens served from the provider prompt cache (billed at 50%). Subset of prompt_tokens.';
