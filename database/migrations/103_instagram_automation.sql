-- 103_instagram_automation.sql
-- Instagram automation: store per-workspace app credentials (encrypted) and the
-- automation toggles. Additive — the existing plaintext access_token column is
-- kept for backward compatibility; new connects write the encrypted columns.

alter table public.instagram_accounts
  add column if not exists app_id            text,
  add column if not exists app_secret_enc    text,   -- AES-256-GCM (lib/crypto-vault)
  add column if not exists access_token_enc  text,   -- AES-256-GCM
  add column if not exists auto_reply_enabled    boolean not null default true,
  add column if not exists comment_reply_enabled boolean not null default false,
  add column if not exists follow_first_enabled  boolean not null default false,
  add column if not exists status            text not null default 'connected';

comment on column public.instagram_accounts.app_secret_enc is 'Instagram App Secret, AES-256-GCM encrypted via lib/crypto-vault. Never returned to the client.';
comment on column public.instagram_accounts.access_token_enc is 'IG access token, AES-256-GCM encrypted. Preferred over the legacy plaintext access_token column.';
