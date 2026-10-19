-- ════════════════════════════════════════════════════════════════════════════
-- 111 — Self-healing Meta-ad attribution + conversation moderation.
--
-- (A) Meta ad attribution depended entirely on Meta sending a `referral` object
--     on the inbound message. In production Meta sent it for only ~60% of clicks
--     on the SAME ad: one Razorveda ad text was attributed 129 times and missed
--     75 times. The only fallback — matching the ad's pre-filled message text —
--     was dead, because 11 of 13 workspaces had no pre-fill text registered and
--     nobody was ever going to type them in by hand.
--
--     Pre-fills are now LEARNED: when Meta does send a referral, we remember that
--     conversation's first message as a known pre-fill, so the next click on the
--     same ad is attributed even when Meta omits the referral.
--
-- (B) Repeat senders of explicit images had to be dealt with by hand — there was
--     no block action in the product at all. Strikes are counted per contact so
--     the first offence only silences the bot and the second blocks.
-- ════════════════════════════════════════════════════════════════════════════

-- ── (A) Learned pre-fills ───────────────────────────────────────────────────
ALTER TABLE public.meta_ad_prefill_messages
  -- Learned from a Meta referral rather than typed in by a human.
  ADD COLUMN IF NOT EXISTS auto_learned BOOLEAN NOT NULL DEFAULT false,
  -- The ad headline Meta reported when this text was learned, for context in the UI.
  ADD COLUMN IF NOT EXISTS learned_from_ad TEXT,
  -- How many referral-attributed conversations opened with this text. A genuine ad
  -- pre-fill repeats; a customer typing their own first line does not.
  ADD COLUMN IF NOT EXISTS seen_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- The webhook matches on a normalised form (case-folded, smart quotes and
-- leading emoji stripped), so index that shape rather than the raw text.
CREATE INDEX IF NOT EXISTS idx_prefill_workspace_lower
  ON public.meta_ad_prefill_messages(workspace_id, lower(btrim(text)));

-- ── (B) Moderation strikes ──────────────────────────────────────────────────
ALTER TABLE public.contacts
  -- Explicit-content strikes. 1 = bot goes quiet and the chat is flagged;
  -- 2 = the contact is blocked automatically.
  ADD COLUMN IF NOT EXISTS moderation_strikes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_flagged_at    TIMESTAMPTZ,
  -- Why they were blocked, so an admin can judge whether to undo it.
  ADD COLUMN IF NOT EXISTS blocked_reason     TEXT,
  ADD COLUMN IF NOT EXISTS blocked_at         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_flagged
  ON public.contacts(workspace_id, last_flagged_at DESC) WHERE last_flagged_at IS NOT NULL;
