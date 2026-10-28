-- 124 — Give Fitness First the offer its campaign is actually advertising, and
-- retire two that are long over.
--
-- The platform has had a Current Offer feature since September: offer text with
-- a validity window, injected at the top of the bot's prompt as the only price
-- it may quote, and withdrawn on its own once the window closes. Of twelve live
-- workspaces, two had ever used it, and neither correctly.
--
-- What that cost this morning. Fitness First launched a Diwali campaign — FLAT
-- 30% OFF, 12 + 3 months, ₹3,333/month — with no offer set. A real lead asked
-- "Kitna Price hai" twice. The bot answered from the knowledge base and the
-- persona instead, quoting ₹7,500/month (total ₹30,500) in one reply and
-- ₹8,000 activation + ₹5,500/month in another. Three price structures in one
-- morning, none of them the campaign's.
--
--   Fitness First  → the campaign's own offer, 28 Oct to 9 Nov (date confirmed
--                    by the user). On 10 Nov the bot stops quoting it by itself.
--   Thames         → "Monsoon Offer" with no end date at all, written for the
--                    monsoon and still the only price the bot would quote in
--                    late October. Retired.
--   VMS            → a three-day Alibaba export event, 7–9 September. Retired.
--
-- Retiring is a removal, not an expiry. An expired offer now tells the bot not
-- to advertise that offer while still answering price questions from the
-- business's own plans; removing it leaves no trace of the offer at all, which
-- is right for two that should never be mentioned again.

-- Fitness First — the exact copy its own flow sends after "Yes".
UPDATE public.workspaces
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
      'active_offer', jsonb_build_object(
        'name',        'Diwali Special — FLAT 30% OFF',
        'details',     E'🔥 FLAT 30% OFF\n🎁 12 + 3 Months Membership (15 months total)\n💰 ₹3,333 per month at the advertised price\n\nThis is the Diwali campaign price. Quote these figures exactly.',
        'valid_from',  '2026-10-28',
        'valid_until', '2026-11-09',
        'updated_at',  to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    )
WHERE name = 'Fitness First' AND is_active = true;

-- Thames and VMS — remove the key entirely.
UPDATE public.workspaces
SET settings = settings - 'active_offer'
WHERE name IN ('Thames Wellness SPA', 'VMS')
  AND settings ? 'active_offer';
