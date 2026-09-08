-- 086_messages_campaign_id.sql
-- The missing correlation: which campaign a message belongs to. Outbound campaign
-- sends and the inbound replies attributed to them are stamped with this. Enables
-- correct per-campaign reply attribution and a campaign-scoped chat view without
-- splitting the single per-contact conversation thread.
alter table messages
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists idx_messages_campaign
  on messages (campaign_id) where campaign_id is not null;

comment on column messages.campaign_id is
  'Campaign this message belongs to: set on campaign outbound sends and on the inbound reply attributed to that campaign. Null for organic/agent/bot messages.';
