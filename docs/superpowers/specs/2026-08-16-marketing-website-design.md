# AGENTiX Marketing Website — Design Spec

**Date:** 2026-08-16
**Status:** Design direction approved; pending spec review → writing-plans
**Part of:** Public SaaS Transformation — Project B (A: onboarding ✓, B: website, C: AI CRM)

## Goal

Replace the single promo page (`app/page.tsx`) with a premium, multi-page marketing website in a new
`app/(marketing)/` route group that funnels visitors into the `/signup` self-service flow (Project A).
Distinctive, not templated; WATI/Interakt/Linear/Stripe caliber; built on the real AGENTiX brand.

## Design direction (approved)

**Concept — "the conversation is the interface":** the signature element is a **living WhatsApp
thread** rendered (not screenshotted) across the site — chat bubbles that reveal on scroll, showing the
AI agent qualifying a lead, booking an appointment, closing a sale, with a small **Lead → Hot → Booked**
pipeline chip lighting up beside it. Every major section is *proven* by a short conversation showing the
AI doing that section's job.

**Real logo (committed, `/public`):** `agentix-wordmark.png` (brain + AGENTiX, light nav) /
`agentix-wordmark-white.png` (dark nav/footer) / `agentix-logo.png` + `-white.png` (full lockup w/
tagline) / `agentix-mark.png` (brain) / `agentix-favicon.png`. **Never recreate the wordmark in code**
— always the image asset. Official tagline: **"AI Applied, Growth Multiplied."**

**Palette (extends the brand tokens in tailwind.config):** navy `#0f1e38`/`#1a2b4a` (premium anchor,
alternating dark sections); orange `brand-500 #e8622a` (CTAs, the AI spark, highlights); warm off-white
`#FBF7F4` (light sections); WhatsApp green **only** inside rendered chat bubbles. Reuse existing
`brand`/`navy` Tailwind scales; add `#FBF7F4` as a `warm` surface token.

**Type:** **Bricolage Grotesque** (Google Fonts via `next/font`) for display headlines used with
restraint; **Inter** (already loaded) for body/UI. A deliberate, non-default pairing.

**Layout:** sections alternate navy/warm-white; confident large display type; generous space; clean
sticky nav; bold in one place (the living threads), quiet + disciplined elsewhere. Quality floor:
responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected (threads render static
when reduced).

## Pages (route group `app/(marketing)/`)

Home `/`, Features overview `/features`, per-feature deep-dives `/features/whatsapp-automation`,
`/features/ai-agent`, `/features/campaigns`, `/features/crm`, `/features/shared-inbox`,
`/features/analytics`; `/integrations`, `/security`, `/pricing`, `/about`, `/contact`, `/faq`,
`/docs` (help hub landing), `/privacy`, `/terms`. (Login/Signup already exist under `(auth)`.)
The current `app/page.tsx` is replaced by `app/(marketing)/page.tsx` (Home).

## Shared components (`modules/marketing/components/`)

- **MarketingLayout** (`app/(marketing)/layout.tsx`): loads Bricolage font, sets per-page metadata
  scaffolding, wraps `<MarketingNav/>` + children + `<MarketingFooter/>`.
- **MarketingNav** — sticky, the real wordmark logo, nav links (Features dropdown, Pricing, Security,
  Docs), a "Log in" + a primary **"Get Started" → /signup** CTA. Transparent-over-hero → solid on
  scroll. Mobile hamburger drawer.
- **MarketingFooter** — dark navy, white logo, columns (Product/Company/Legal/Resources), the tagline,
  contact email `support@agentix.in`, social, copyright.
- **ConversationThread** (THE signature) — renders an array of `{ from: 'customer'|'agent', text,
  typing? }` turns as WhatsApp-style bubbles (customer left/white, agent right/green-tinted), with a
  scroll-triggered staggered reveal + a typing indicator, and an optional `PipelineChip` (Lead→Hot→Booked)
  that lights up on completion. Static (no animation) under `prefers-reduced-motion`. Reused on every
  major section with different scripted conversations.
- **Section primitives:** `Section` (navy|warm variant + padding), `Eyebrow`, `DisplayHeading`
  (Bricolage), `FeatureCard`, `StatBadge`, `CTABand` (recurring "start free" band), `LogoCloud`
  (client trust: the real clients — Umang Hospital, Razorveda, etc., as text/badges), `FaqAccordion`,
  `PricingTable` (reads the real `billing_plans` amounts / the offer matrix; WhatsApp ₹2,999 + IG add-on
  + term offers; "Get Started" → /signup).

## Content

Hardcoded React, real + benefit-driven copy (from the end user's side — "answer every customer in
seconds," not "webhook automation"). Ground it in the real product + Indian-SMB audience (hospitals,
salons, retail, coaching). Differentiators to lead with (from the competitor analysis): bundled live AI
agent (not an add-on), WhatsApp + Instagram unified inbox, temperature Kanban CRM, transparent flat INR
pricing. No invented testimonials/logos beyond the real clients; use honest, specific copy.

## SEO / technical

- Per-page `metadata` (title, description, OpenGraph, canonical) via Next's Metadata API; a shared
  OG image (brand). `app/sitemap.ts` + `app/robots.ts`. Semantic headings, alt text on the logo,
  `lang="en"`. Fast (server components, no heavy client JS beyond the thread animations).
- The route group shares the app's Tailwind/tokens; the marketing layout does NOT pull the dashboard
  shell/auth. Public (no auth gate).

## Build order (waves)

1. **Foundation + Home** — Bricolage font + `warm` token; MarketingLayout/Nav/Footer; the
   `ConversationThread` signature + section primitives; the full **Home** page (hero with the living
   thread, differentiators, feature preview, pricing teaser, trust, CTA). *This wave establishes the
   entire system and the flagship page.*
2. **Features cluster** — `/features` overview + the 6 per-feature deep-dive pages (same template, each
   with its own scripted conversation + benefit copy).
3. **Conversion + company** — `/pricing` (real amounts), `/integrations`, `/security`, `/about`,
   `/contact`, `/faq`.
4. **Docs + legal** — `/docs` hub, `/privacy`, `/terms`.
Each wave batches same-shape pages into single implementer dispatches + a review.

## Testing
- Unit: `ConversationThread` renders the scripted turns + the pipeline chip; `PricingTable` maps the
  billing amounts correctly; reduced-motion renders static.
- Visual/manual (controller): run `next dev` + Playwright screenshot the Home page at desktop + 375px
  to verify the design lands (the one design-critical check the plan can't assert from code).
- Links: every "Get Started"/"Log in" points to `/signup`/`/login`; nav/footer links resolve; no dead
  routes; responsive down to 375px; keyboard focus visible.

## Out of scope
Blog/CMS, i18n/Hindi localization, a real docs system (the `/docs` page is a help-hub landing, not a
full docs engine), live chat widget, A/B testing. AI CRM automation = Project C.

## Self-review notes
- The signature (living conversation) is the one bold element; everything else stays disciplined —
  matches the frontend-design "spend boldness in one place" principle.
- Real logo asset used everywhere (never recreated); official tagline adopted.
- Pricing pulls the real `billing_plans` amounts so the site can't drift from actual billing.
- Home first (hardest + establishes the system), then batched same-shape pages — keeps each wave
  reviewable and the design consistent.
