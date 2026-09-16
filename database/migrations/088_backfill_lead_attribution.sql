-- 088_backfill_lead_attribution.sql
-- Phase 1 (Unified Lead Hub): one-time backfill of the normalized attribution
-- columns for EXISTING leads/contacts (migration 087 added the columns as NULL).
-- Idempotent & safe to re-run — every UPDATE is guarded by `channel IS NULL`,
-- so already-attributed rows (and anything the live app fills going forward)
-- are never overwritten.

-- ── Leads ───────────────────────────────────────────────────────────────────
-- Derive channel from the existing free-text `source`, else the linked
-- conversation's channel, else default to whatsapp (the platform's primary
-- inbound channel). Seed first/last touch from the lead's created_at.
with lead_derived as (
  select
    l.id,
    coalesce(
      nullif(
        case
          when lower(coalesce(l.source, '')) in ('meta_ad', 'meta_ads', 'facebook_ad', 'fb_ad', 'ctwa') then 'meta_ads'
          when lower(coalesce(l.source, '')) in ('whatsapp_flow', 'whatsapp', 'wa')                     then 'whatsapp'
          when lower(coalesce(l.source, '')) in ('instagram', 'ig')                                     then 'instagram'
          when lower(coalesce(l.source, '')) in ('google_ads', 'google_ad', 'adwords')                  then 'google_ads'
          when lower(coalesce(l.source, '')) in ('gbp', 'gmb', 'google_business')                       then 'gbp'
          when lower(coalesce(l.source, '')) in ('website', 'web', 'chat_widget', 'widget')             then 'website'
          when lower(coalesce(l.source, '')) in ('campaign', 'broadcast')                               then 'campaign'
          when lower(coalesce(l.source, '')) in ('api')                                                 then 'api'
          when lower(coalesce(l.source, '')) in ('referral', 'ref')                                     then 'referral'
          when lower(coalesce(l.source, '')) in ('manual', 'import', 'csv', 'bulk', 'admin', 'dashboard') then 'manual'
          else ''
        end, ''),
      (select case c.channel when 'instagram' then 'instagram' when 'whatsapp' then 'whatsapp' else null end
         from public.conversations c where c.id = l.conversation_id),
      'whatsapp'
    ) as ch
  from public.leads l
  where l.channel is null
)
update public.leads l
set
  channel             = d.ch,
  source_detail       = coalesce(l.source_detail, l.source),
  first_touch_channel = coalesce(l.first_touch_channel, d.ch),
  first_touch_at      = coalesce(l.first_touch_at, l.created_at),
  last_touch_channel  = coalesce(l.last_touch_channel, d.ch),
  last_touch_at       = coalesce(l.last_touch_at, l.created_at)
from lead_derived d
where l.id = d.id;

-- ── Contacts ────────────────────────────────────────────────────────────────
-- Contacts carry no `source`; derive channel from the pseudo-phone prefix
-- (Instagram/Messenger use non-numeric ids) or the contact's earliest
-- conversation channel, else whatsapp. Seed first/last touch from the
-- earliest conversation / latest message, falling back to the contact row.
with contact_derived as (
  select
    ct.id,
    case
      when ct.phone like 'ig:%'         then 'instagram'
      when ct.phone like 'instagram\_%' then 'instagram'
      when ct.phone like 'messenger\_%' then 'other'
      else coalesce(
        (select c.channel
           from public.conversations c
          where c.workspace_id = ct.workspace_id and c.contact_id = ct.id
          order by c.created_at asc
          limit 1),
        'whatsapp'
      )
    end as ch,
    coalesce(
      (select min(c.created_at) from public.conversations c where c.contact_id = ct.id),
      ct.created_at
    ) as first_at,
    coalesce(
      (select max(c.last_message_at) from public.conversations c where c.contact_id = ct.id),
      ct.updated_at,
      ct.created_at
    ) as last_at
  from public.contacts ct
  where ct.channel is null
)
update public.contacts ct
set
  channel             = cd.ch,
  first_touch_channel = coalesce(ct.first_touch_channel, cd.ch),
  first_touch_at      = coalesce(ct.first_touch_at, cd.first_at),
  last_touch_channel  = coalesce(ct.last_touch_channel, cd.ch),
  last_touch_at       = coalesce(ct.last_touch_at, cd.last_at)
from contact_derived cd
where ct.id = cd.id;
