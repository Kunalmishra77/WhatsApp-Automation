-- 145 — ROLLBACK for migration 144 (and 146, if that has been run).
--
-- Run this the moment the Conversations page stops updating live, or a new
-- message stops appearing in an open thread without a refresh.
--
-- It changes no data and takes no lock worth worrying about — REPLICA IDENTITY
-- is a catalogue setting. Running it when nothing is wrong is harmless; it puts
-- the tables back exactly as migration 047 left them.
--
-- The indexes are left in place on purpose. They cost a little write time and
-- they are what migration 144 needs if it is tried again; dropping them while
-- a table still points at one as its replica identity would silently leave the
-- table at REPLICA IDENTITY NOTHING, which is worse than where this started.

ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages      REPLICA IDENTITY FULL;

-- Confirm with:
--   SELECT relname, relreplident FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace
--     AND relname IN ('conversations','messages','notifications');
-- 'f' is FULL, 'i' is USING INDEX, 'd' is DEFAULT (primary key), 'n' is NOTHING.
