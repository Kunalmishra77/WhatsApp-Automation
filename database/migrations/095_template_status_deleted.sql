-- 095_template_status_deleted.sql
-- The templates sync route soft-deletes templates removed on Meta by setting
-- status='deleted', but the template_status enum never had that value, causing
-- `22P02 invalid input value for enum template_status: "deleted"` on every sync.
-- Add the missing value. (ALTER TYPE ADD VALUE runs outside a txn — single stmt.)

ALTER TYPE public.template_status ADD VALUE IF NOT EXISTS 'deleted';
