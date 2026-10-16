-- ════════════════════════════════════════════════════════════════════════════
-- 2026-10-16 — Remove six EMPTY leftover workspaces.
--
-- Why: duplicate / abandoned signups cluttered the account list, and one of them
-- ("Priti Razorveda") was actively breaking an invited employee: they owned that
-- half-finished workspace, so the dashboard kept dropping them into ITS WhatsApp
-- setup wizard instead of the team they had been invited to.
--
-- Every workspace listed below has ZERO contacts, conversations, messages,
-- campaigns and leads — verified before this file was written, and verified
-- AGAIN by the guard block at the top of the transaction, which aborts the whole
-- thing if any of them has gained data since.
--
-- A copy of each row (and its memberships) is written to
-- public._deleted_workspaces_backup before the delete, so this is recoverable.
--
-- NOT touched on purpose:
--   * Lennore India Pvt Ltd  3b527281…  142 contacts / 665 msgs / 5 campaigns
--   * Lennore India Pvt Ltd  2d106589…  125 contacts / 814 msgs / 7 campaigns
--     Two LIVE workspaces with different owners and real client data. They look
--     like duplicates by name only — deleting either destroys a live account.
--   * Wise Advise  fbec3a6d…   18 contacts / 485 msgs — live, kept.
--   * AGENTiX  59c92699… and a9d2b388… — internal, but they hold a few test
--     messages, so they are left for a separate decision.
--
-- Run with:  node database/run-migration.mjs maintenance/2026-10-16_delete_empty_workspaces.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _targets (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _targets (id) VALUES
  ('b4995624-7c63-4a08-a68e-a9f4ff8c9983'),  -- Agentix          (27 Jul, inactive, no members)
  ('2a8db020-25f9-42be-a42b-bd536662f8e3'),  -- Agentix          (27 Jul, myai@ai-agentix.com)
  ('e0dcb04f-7593-4220-9c8e-242dbc8e05bd'),  -- Lennore          (06 Aug, lennoreindia@gmail.com)
  ('d774e0be-90c2-4e8f-85fe-7780b6293844'),  -- priti            (14 Oct, razorveda12@gmail.com)
  ('dee7dd79-62bf-4df6-978b-97e0a463138b'),  -- Priti Razorveda  (15 Oct, razorveda04@gmail.com)
  ('aa88b414-1928-4a2e-8b0e-663b5692df51');  -- Wise Advise      (11 Aug, no members)

-- ── Guard: abort unless every target is still completely empty ───────────────
DO $$
DECLARE
  not_empty int;
  missing   int;
BEGIN
  SELECT count(*) INTO not_empty
  FROM workspaces w
  JOIN _targets t ON t.id = w.id
  WHERE (SELECT count(*) FROM contacts      WHERE workspace_id = w.id)
      + (SELECT count(*) FROM conversations WHERE workspace_id = w.id)
      + (SELECT count(*) FROM messages      WHERE workspace_id = w.id)
      + (SELECT count(*) FROM campaigns     WHERE workspace_id = w.id)
      + (SELECT count(*) FROM leads         WHERE workspace_id = w.id) > 0;

  IF not_empty > 0 THEN
    RAISE EXCEPTION 'Aborted: % target workspace(s) now hold data. Nothing deleted.', not_empty;
  END IF;

  SELECT count(*) INTO missing
  FROM _targets t WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = t.id);

  IF missing > 0 THEN
    RAISE NOTICE '% of the 6 target workspaces are already gone.', missing;
  END IF;
END $$;

-- ── Keep a recoverable copy ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._deleted_workspaces_backup (
  id         BIGSERIAL PRIMARY KEY,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason     TEXT,
  workspace  JSONB NOT NULL,
  members    JSONB
);

INSERT INTO public._deleted_workspaces_backup (reason, workspace, members)
SELECT
  'empty leftover/duplicate signup — 2026-10-16 cleanup',
  to_jsonb(w),
  (SELECT jsonb_agg(to_jsonb(m)) FROM workspace_members m WHERE m.workspace_id = w.id)
FROM workspaces w
JOIN _targets t ON t.id = w.id;

-- ── Delete (every workspace FK is CASCADE or SET NULL — verified) ───────────
DELETE FROM workspaces w USING _targets t WHERE w.id = t.id;

COMMIT;

-- Afterwards, these three accounts have no workspace left and will be offered
-- the "create a workspace" screen on their next login. All three owned only an
-- empty workspace, so nothing of theirs is lost:
--   razorveda12@gmail.com, lennoreindia@gmail.com, myai@ai-agentix.com
-- razorveda04@gmail.com keeps its Razorveda membership, which is the point.
