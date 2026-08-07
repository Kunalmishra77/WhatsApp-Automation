# Current Offer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each workspace one authoritative "Current Offer" so the bot always quotes the right price, never a stale one, and defers to the team when no offer is active.

**Architecture:** The offer is a structured object stored in `workspaces.settings.active_offer` (no new hot-path table — it rides the existing 60s workspace cache). Pure helpers in `lib/offer.ts` compute offer status and build the prompt block; `getAIReply` injects that block at the very top of the reply prompt as the sole pricing authority. A thin `/api/offer` route writes the offer + returns conflict warnings; a settings-page card drives it; a pure-SQL daily pg_cron reminds clients when an offer lapses.

**Tech Stack:** Next.js 15 (App Router route handlers), TypeScript, Vitest, Supabase Postgres + pg_cron, Upstash Redis (workspace cache), React (settings UI).

## Global Constraints

- Offer stored at `workspaces.settings.active_offer` as `{ name, details, valid_from?, valid_until?, updated_at?, lapse_notified? }`; dates are `YYYY-MM-DD` strings.
- Feature is **opt-in and non-breaking**: a workspace with no `active_offer` object behaves exactly as today (KB/persona pricing, no injected block).
- The GUARD block fires only for `expired`/`scheduled` (an offer object exists but isn't currently valid) — never for `none`.
- `details` capped at 1500 characters.
- Offer status is computed against **today's date in IST** (`Asia/Kolkata`), date-only comparison.
- Money detection targets `₹` / `Rs` / `INR`-prefixed amounts only (never bare numbers — avoids matching phones/years).
- API auth: `requireWorkspacePermission(workspaceId, 'manage_workspace')` (roles `super_admin`, `admin`).
- After any offer write, call `invalidateWorkspace({ id })` so the change is live immediately (not after the 60s TTL).
- Lapse-reminder notifications target `workspace_members` with role in (`super_admin`, `admin`); `notifications` requires `workspace_id`, `user_id`, `type`, `title`.
- Commit after every task with a Conventional Commit message. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Pure offer helpers (`lib/offer.ts`)

**Files:**
- Create: `lib/offer.ts`
- Test: `tests/offer.test.ts`

**Interfaces:**
- Produces:
  - `interface ActiveOffer { name: string; details: string; valid_from?: string; valid_until?: string; updated_at?: string; lapse_notified?: boolean }`
  - `type OfferStatus = 'active' | 'expired' | 'scheduled' | 'none'`
  - `parseActiveOffer(settings: Record<string, unknown> | null | undefined): ActiveOffer | null`
  - `computeOfferStatus(offer: ActiveOffer | null, todayISO: string): OfferStatus`
  - `buildOfferBlock(offer: ActiveOffer | null, status: OfferStatus): string`
  - `pricingBlockForSettings(settings: Record<string, unknown> | null | undefined, todayISO: string): string`
  - `extractMoneyAmounts(text: string): string[]` (normalized digit strings)
  - `findConflictingAmounts(offerDetails: string, sources: string[]): string[]` (display strings like `₹27,450`)
  - `validateOfferInput(body: OfferInput): { ok: true; offer: ActiveOffer } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/offer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  parseActiveOffer, computeOfferStatus, buildOfferBlock, pricingBlockForSettings,
  extractMoneyAmounts, findConflictingAmounts, validateOfferInput,
} from '../lib/offer';

const OFFER = { name: 'Monsoon Offer', details: 'Buy 1 Year for ₹75,000, get 1 Year FREE.', valid_from: '2026-08-04', valid_until: '2026-08-31' };

describe('parseActiveOffer', () => {
  it('returns null when absent or invalid', () => {
    expect(parseActiveOffer(null)).toBeNull();
    expect(parseActiveOffer({})).toBeNull();
    expect(parseActiveOffer({ active_offer: { name: '', details: 'x' } })).toBeNull();
  });
  it('parses a valid offer and drops malformed dates', () => {
    const o = parseActiveOffer({ active_offer: { ...OFFER, valid_from: 'bad' } });
    expect(o?.name).toBe('Monsoon Offer');
    expect(o?.valid_from).toBeUndefined();
    expect(o?.valid_until).toBe('2026-08-31');
  });
});

describe('computeOfferStatus', () => {
  const o = parseActiveOffer({ active_offer: OFFER })!;
  it('none when no offer', () => expect(computeOfferStatus(null, '2026-08-10')).toBe('none'));
  it('active inside window', () => expect(computeOfferStatus(o, '2026-08-10')).toBe('active'));
  it('scheduled before valid_from', () => expect(computeOfferStatus(o, '2026-08-01')).toBe('scheduled'));
  it('expired after valid_until', () => expect(computeOfferStatus(o, '2026-09-01')).toBe('expired'));
  it('evergreen active when no valid_until', () => {
    const ev = parseActiveOffer({ active_offer: { name: 'X', details: 'Y' } })!;
    expect(computeOfferStatus(ev, '2030-01-01')).toBe('active');
  });
});

describe('buildOfferBlock', () => {
  const o = parseActiveOffer({ active_offer: OFFER })!;
  it('active block contains offer + override language', () => {
    const b = buildOfferBlock(o, 'active');
    expect(b).toContain('CURRENT OFFER');
    expect(b).toContain('₹75,000');
    expect(b).toContain('Valid until 2026-08-31');
    expect(b).toMatch(/ONLY price/i);
  });
  it('expired/scheduled yields guard, none yields empty', () => {
    expect(buildOfferBlock(o, 'expired')).toMatch(/no active offer/i);
    expect(buildOfferBlock(o, 'scheduled')).toMatch(/no active offer/i);
    expect(buildOfferBlock(null, 'none')).toBe('');
  });
});

describe('pricingBlockForSettings', () => {
  it('none settings → empty (backward compatible)', () => {
    expect(pricingBlockForSettings({}, '2026-08-10')).toBe('');
  });
  it('active offer → offer block', () => {
    expect(pricingBlockForSettings({ active_offer: OFFER }, '2026-08-10')).toContain('₹75,000');
  });
});

describe('extractMoneyAmounts / findConflictingAmounts', () => {
  it('extracts ₹/Rs/INR amounts, ignores bare numbers', () => {
    expect(extractMoneyAmounts('₹75,000 and Rs 27,450 and INR 55950')).toEqual(['75000', '27450', '55950']);
    expect(extractMoneyAmounts('call 9876543210 at 9-5')).toEqual([]);
  });
  it('returns KB amounts not present in the offer', () => {
    const out = findConflictingAmounts('Only ₹75,000', ['3 Months ₹27,450', '12 Months ₹55,950', 'best ₹75,000']);
    expect(out).toContain('₹27,450');
    expect(out).toContain('₹55,950');
    expect(out).not.toContain('₹75,000');
  });
});

describe('validateOfferInput', () => {
  it('rejects missing name/details and bad dates', () => {
    expect(validateOfferInput({ details: 'x' }).ok).toBe(false);
    expect(validateOfferInput({ name: 'A', details: 'B', valid_until: '31-08-2026' }).ok).toBe(false);
    expect(validateOfferInput({ name: 'A', details: 'B', valid_from: '2026-08-31', valid_until: '2026-08-01' }).ok).toBe(false);
  });
  it('accepts a valid offer and trims', () => {
    const r = validateOfferInput({ name: '  Monsoon  ', details: '  ₹75,000  ' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.offer.name).toBe('Monsoon'); expect(r.offer.details).toBe('₹75,000'); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/offer.test.ts`
Expected: FAIL — `Cannot find module '../lib/offer'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/offer.ts`:

```typescript
// lib/offer.ts — Current Offer: the single authoritative pricing the bot quotes.

export interface ActiveOffer {
  name: string;
  details: string;
  valid_from?: string;   // 'YYYY-MM-DD'
  valid_until?: string;  // 'YYYY-MM-DD'
  updated_at?: string;
  lapse_notified?: boolean;
}

export type OfferStatus = 'active' | 'expired' | 'scheduled' | 'none';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// ₹/Rs/INR followed by grouped digits. Word-boundary on rs/inr avoids matching inside words.
const MONEY_RE = /(?:₹|\brs\.?|\binr\b)\s*(\d[\d,\s]{2,})/gi;

export function parseActiveOffer(settings: Record<string, unknown> | null | undefined): ActiveOffer | null {
  const raw = settings?.active_offer;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.details !== 'string') return null;
  if (!o.name.trim() || !o.details.trim()) return null;
  return {
    name: o.name,
    details: o.details,
    valid_from: typeof o.valid_from === 'string' && DATE_RE.test(o.valid_from) ? o.valid_from : undefined,
    valid_until: typeof o.valid_until === 'string' && DATE_RE.test(o.valid_until) ? o.valid_until : undefined,
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : undefined,
    lapse_notified: o.lapse_notified === true,
  };
}

// todayISO = 'YYYY-MM-DD'. Date strings compare correctly lexicographically.
export function computeOfferStatus(offer: ActiveOffer | null, todayISO: string): OfferStatus {
  if (!offer) return 'none';
  if (offer.valid_from && offer.valid_from > todayISO) return 'scheduled';
  if (offer.valid_until && offer.valid_until < todayISO) return 'expired';
  return 'active';
}

export function buildOfferBlock(offer: ActiveOffer | null, status: OfferStatus): string {
  if (status === 'active' && offer) {
    const validity = offer.valid_until ? ` Valid until ${offer.valid_until}.` : '';
    return `🔴 CURRENT OFFER — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW.
This is the ONLY price/offer you may quote. If the customer asks about price, plans, or offers, use EXACTLY this and nothing else. NEVER quote any other price, plan, discount, or EMI that appears anywhere else in this prompt or the knowledge base — those are outdated.
Offer: ${offer.name}
${offer.details}${validity}

`;
  }
  if (status === 'expired' || status === 'scheduled') {
    return `PRICING RULE: There is no active offer right now. If the customer asks about price, plans, or offers, do NOT quote any number from the knowledge base or persona. Warmly say a team member will share the latest pricing shortly, and capture their interest / ask for the best number to reach them.

`;
  }
  return '';
}

export function pricingBlockForSettings(
  settings: Record<string, unknown> | null | undefined, todayISO: string,
): string {
  const offer = parseActiveOffer(settings);
  return buildOfferBlock(offer, computeOfferStatus(offer, todayISO));
}

export function extractMoneyAmounts(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;
  for (const m of text.matchAll(MONEY_RE)) {
    const norm = m[1].replace(/[,\s]/g, '');
    if (norm.length >= 3) out.push(norm);
  }
  return out;
}

export function findConflictingAmounts(offerDetails: string, sources: string[]): string[] {
  const offerSet = new Set(extractMoneyAmounts(offerDetails));
  const seen = new Map<string, string>(); // normalized -> display
  for (const src of sources) {
    if (!src) continue;
    for (const m of src.matchAll(MONEY_RE)) {
      const norm = m[1].replace(/[,\s]/g, '');
      if (norm.length < 3 || offerSet.has(norm) || seen.has(norm)) continue;
      seen.set(norm, `₹${Number(norm).toLocaleString('en-IN')}`);
    }
  }
  return [...seen.values()];
}

export interface OfferInput {
  name?: unknown; details?: unknown; valid_from?: unknown; valid_until?: unknown;
}

export function validateOfferInput(
  body: OfferInput,
): { ok: true; offer: ActiveOffer } | { ok: false; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (!name) return { ok: false, error: 'name is required' };
  if (!details) return { ok: false, error: 'details is required' };
  if (details.length > 1500) return { ok: false, error: 'details must be 1500 characters or fewer' };
  const vf = typeof body.valid_from === 'string' && body.valid_from ? body.valid_from : undefined;
  const vu = typeof body.valid_until === 'string' && body.valid_until ? body.valid_until : undefined;
  if (vf && !DATE_RE.test(vf)) return { ok: false, error: 'valid_from must be YYYY-MM-DD' };
  if (vu && !DATE_RE.test(vu)) return { ok: false, error: 'valid_until must be YYYY-MM-DD' };
  if (vf && vu && vu < vf) return { ok: false, error: 'valid_until must be on or after valid_from' };
  return { ok: true, offer: { name, details, valid_from: vf, valid_until: vu } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/offer.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/offer.ts tests/offer.test.ts
git commit -m "feat(offer): pure helpers for Current Offer status, prompt block, conflict scan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Inject the offer block into replies (`lib/ai-reply.ts`)

**Files:**
- Modify: `lib/ai-reply.ts` (imports near top; system-prompt assembly around lines 366–405)
- Verify: `tests/verify-offer-reply.mjs` (scripted generation smoke test — manual run)

**Interfaces:**
- Consumes: `pricingBlockForSettings` from Task 1.
- Produces: no new exports; `getAIReply` now prepends the pricing block and adds a pricing-authority rule when an offer/guard block is present.

- [ ] **Step 1: Add the import**

At the top of `lib/ai-reply.ts`, add:

```typescript
import { pricingBlockForSettings } from '@/lib/offer';
```

- [ ] **Step 2: Compute the block before the system prompt**

In `getAIReply`, find where `nowIST` is computed (≈ line 366). Immediately after it, add:

```typescript
  // Today's date in IST as YYYY-MM-DD (en-CA yields ISO date). Drives offer validity.
  const todayISTDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const offerBlock = pricingBlockForSettings(wsSettings ?? null, todayISTDate);
  const pricingAuthorityRule = offerBlock
    ? '\n- PRICING AUTHORITY: For any question about price, plans, or offers, follow the block at the very TOP of this prompt — it is the ONLY authority on pricing. Ignore any other price in the knowledge base or persona.'
    : '';
```

- [ ] **Step 3: Prepend the block and add the rule**

Find the `systemPrompt` template literal (starts `const systemPrompt = \`${kbBlock}${basePersona}`, ≈ line 386). Change its opening so the offer block comes first:

```typescript
  const systemPrompt = `${offerBlock}${kbBlock}${basePersona}
```

Then find the KB-priority rule line (≈ line 401, `- KNOWLEDGE BASE PRIORITY:`) and append the authority rule right after it by inserting `${pricingAuthorityRule}` on the following line of the same template (so it renders only when a block exists). Concretely, the line that currently reads:

```
- KNOWLEDGE BASE PRIORITY: When the KB above contains information relevant to the customer's question, use it EXACTLY — do not rephrase or blend with persona content. KB facts always override persona text.
```

becomes:

```
- KNOWLEDGE BASE PRIORITY: When the KB above contains information relevant to the customer's question, use it EXACTLY — do not rephrase or blend with persona content. KB facts always override persona text (EXCEPT pricing, see below).${pricingAuthorityRule}
```

- [ ] **Step 4: Typecheck + confirm existing reply tests still pass**

Run: `npx tsc --noEmit && npx vitest run tests/ai-reply.test.ts`
Expected: tsc clean; all existing `ai-reply` tests PASS (no behavior change when no offer is set).

- [ ] **Step 5: Scripted generation smoke test (manual)**

Create `tests/verify-offer-reply.mjs` (run locally with a real `OPENAI_API_KEY`; not part of CI):

```javascript
// Proves an active offer overrides a conflicting KB price. Run: node tests/verify-offer-reply.mjs
import { pricingBlockForSettings } from '../lib/offer.js';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const settings = { active_offer: { name: 'Monsoon Offer', details: 'Buy 1 Year for ₹75,000 and get 1 Year FREE. No package below ₹75,000.', valid_until: '2099-12-31' } };
const block = pricingBlockForSettings(settings, today);
const kb = 'KNOWLEDGE BASE: 3 Months ₹27,450, 6 Months ₹37,450, 12 Months ₹55,950.';
const system = `${block}${kb}\nReply in the customer's language. For pricing follow the top block only.`;
const r = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: 'What are your membership prices?' }], max_tokens: 200, temperature: 0.3 }),
});
const reply = (await r.json())?.choices?.[0]?.message?.content ?? '';
console.log(reply);
console.log('quotes ₹75,000:', /75,?000/.test(reply), '| quotes stale:', /27,?450|37,?450|55,?950/.test(reply));
```

Run: `node tests/verify-offer-reply.mjs`
Expected: reply quotes ₹75,000 and NOT the stale figures. (If the repo builds ESM `.js` differently, run via the same tsx/build path used for other scripts; this is a one-off confidence check, not CI.)

- [ ] **Step 6: Commit**

```bash
git add lib/ai-reply.ts tests/verify-offer-reply.mjs
git commit -m "feat(offer): inject Current Offer as sole pricing authority in getAIReply

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Offer API route with conflict scan (`app/api/offer/route.ts`)

**Files:**
- Create: `app/api/offer/route.ts`

**Interfaces:**
- Consumes: `validateOfferInput`, `findConflictingAmounts` from Task 1; `requireWorkspacePermission`, `authzResponse`, `AuthzError` from `@/lib/authz`; `createAdminClient` from `@/services/supabase/admin`; `invalidateWorkspace` from `@/lib/workspace-cache`.
- Produces: `PUT /api/offer` → `{ ok: true, warnings: string[] }`; `DELETE /api/offer` → `{ ok: true }`.

- [ ] **Step 1: Write the route**

Create `app/api/offer/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { invalidateWorkspace } from '@/lib/workspace-cache';
import { validateOfferInput, findConflictingAmounts } from '@/lib/offer';
import type { Json } from '@/types/database.types';

// PUT /api/offer  Body: { workspaceId, name, details, valid_from?, valid_until? }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { workspaceId?: string } & Record<string, unknown>;
    const workspaceId = body.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const parsed = validateOfferInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const db = createAdminClient() as any;
    const { data: existing } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = (existing?.settings ?? {}) as Record<string, unknown>;

    const active_offer = { ...parsed.offer, updated_at: new Date().toISOString(), lapse_notified: false };
    const nextSettings = { ...settings, active_offer } as Json;

    const { error } = await db.from('workspaces')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await invalidateWorkspace({ id: workspaceId });

    // Conflict scan: gather KB + uploaded-doc + persona text, warn about non-offer amounts.
    const sources: string[] = [];
    const persona = settings.agent_persona;
    if (typeof persona === 'string') sources.push(persona);
    const { data: kb } = await db.from('knowledge_base').select('content').eq('workspace_id', workspaceId).eq('is_active', true).limit(200);
    for (const r of (kb ?? []) as Array<{ content: string }>) sources.push(r.content);
    const { data: docs } = await db.from('vector_documents').select('content').eq('workspace_id', workspaceId).limit(300);
    for (const r of (docs ?? []) as Array<{ content: string }>) sources.push(r.content);

    const warnings = findConflictingAmounts(parsed.offer.details, sources);
    return NextResponse.json({ ok: true, warnings });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Offer PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/offer?workspaceId=...  → clears the active offer.
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: existing } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = { ...((existing?.settings ?? {}) as Record<string, unknown>) };
    delete settings.active_offer;

    const { error } = await db.from('workspaces')
      .update({ settings: settings as Json, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await invalidateWorkspace({ id: workspaceId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Offer DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck + build the route**

Run: `npx tsc --noEmit && npx next build`
Expected: tsc clean; build output lists `ƒ /api/offer`.

- [ ] **Step 3: Manual smoke test (local dev server)**

With `npm run dev` running and a valid session cookie for an `admin` of a test workspace:

```bash
# Save an offer (expect { ok: true, warnings: [...] })
curl -X PUT http://localhost:3000/api/offer -H 'Content-Type: application/json' \
  --cookie "<session>" \
  -d '{"workspaceId":"<WS>","name":"Test Offer","details":"Only ₹75,000 for 2 years.","valid_until":"2099-12-31"}'
# Clear it
curl -X DELETE "http://localhost:3000/api/offer?workspaceId=<WS>" --cookie "<session>"
```

Expected: PUT returns `{ ok: true, warnings: [...] }` (warnings non-empty if the workspace KB/persona mentions other ₹ amounts); DELETE returns `{ ok: true }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/offer/route.ts
git commit -m "feat(offer): PUT/DELETE /api/offer with save-time conflict scan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: "Current Offer" settings card (UI)

**Files:**
- Create: `modules/settings/components/CurrentOfferCard.tsx`
- Modify: the workspace settings page that renders other settings cards (e.g. `app/(dashboard)/settings/page.tsx` or the settings module's page — locate the file that renders the existing workspace settings and mount `<CurrentOfferCard workspaceId={workspaceId} initialOffer={...} />` there; reuse how that page already obtains `workspaceId` and workspace `settings`).

**Interfaces:**
- Consumes: `PUT /api/offer`, `DELETE /api/offer` from Task 3; the settings page's existing `workspaceId` + `settings.active_offer`.
- Produces: `CurrentOfferCard` React component.

- [ ] **Step 1: Locate the mount point**

Run: `grep -rn "settings" app --include=page.tsx -l | head` and open the workspace settings page. Confirm how it gets `workspaceId` and the workspace `settings` object (to pass `initialOffer={settings.active_offer}`). Note the file path for Step 3.

- [ ] **Step 2: Create the component**

Create `modules/settings/components/CurrentOfferCard.tsx`:

```tsx
'use client';
import { useState } from 'react';

interface OfferShape {
  name?: string; details?: string; valid_from?: string; valid_until?: string;
}

function statusOf(o: OfferShape | null): 'Active' | 'Scheduled' | 'Expired' | 'None' {
  if (!o?.name || !o?.details) return 'None';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (o.valid_from && o.valid_from > today) return 'Scheduled';
  if (o.valid_until && o.valid_until < today) return 'Expired';
  return 'Active';
}

export function CurrentOfferCard({ workspaceId, initialOffer }: { workspaceId: string; initialOffer?: OfferShape | null }) {
  const [name, setName] = useState(initialOffer?.name ?? '');
  const [details, setDetails] = useState(initialOffer?.details ?? '');
  const [validFrom, setValidFrom] = useState(initialOffer?.valid_from ?? '');
  const [validUntil, setValidUntil] = useState(initialOffer?.valid_until ?? '');
  const [saved, setSaved] = useState<OfferShape | null>(initialOffer ?? null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const status = statusOf(saved);

  async function save() {
    setBusy(true); setError(''); setWarnings([]);
    try {
      const res = await fetch('/api/offer', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name, details, valid_from: validFrom || undefined, valid_until: validUntil || undefined }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? 'Failed to save'); return; }
      setWarnings(j.warnings ?? []);
      setSaved({ name, details, valid_from: validFrom || undefined, valid_until: validUntil || undefined });
    } finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true); setError(''); setWarnings([]);
    try {
      const res = await fetch(`/api/offer?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed to clear'); return; }
      setName(''); setDetails(''); setValidFrom(''); setValidUntil(''); setSaved(null);
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Current Offer</h3>
        <span className="text-xs rounded-full px-2 py-0.5 border">{status}</span>
      </div>
      <p className="text-sm text-gray-500">This is the only pricing the bot will quote to customers.</p>
      <input className="w-full border rounded px-3 py-2" placeholder="Offer name (e.g. Monsoon Offer)" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea className="w-full border rounded px-3 py-2" rows={4} maxLength={1500} placeholder="Offer details — price + terms the bot should quote" value={details} onChange={(e) => setDetails(e.target.value)} />
      <div className="flex gap-3">
        <label className="text-sm flex-1">Valid from<input type="date" className="w-full border rounded px-2 py-1" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></label>
        <label className="text-sm flex-1">Valid until<input type="date" className="w-full border rounded px-2 py-1" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {warnings.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          ⚠️ Your knowledge base / persona still mentions {warnings.join(', ')} — these may confuse the bot. Consider updating them.
        </div>
      )}
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">Save</button>
        <button disabled={busy || !saved} onClick={clear} className="px-4 py-2 rounded border disabled:opacity-50">Clear</button>
      </div>
    </div>
  );
}
```

(Match the surrounding settings page's styling conventions — swap the utility classes above for whatever the page already uses if different.)

- [ ] **Step 3: Mount it on the settings page**

In the settings page located in Step 1, import and render the card, passing the workspace id and the current offer:

```tsx
import { CurrentOfferCard } from '@/modules/settings/components/CurrentOfferCard';
// ...inside the render, alongside other cards:
<CurrentOfferCard workspaceId={workspaceId} initialOffer={(settings?.active_offer as any) ?? null} />
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: clean build.

- [ ] **Step 5: Manual check (dev server)**

Open the settings page, save an offer, confirm the status pill and any conflict warnings render, reload to confirm persistence, then Clear.

- [ ] **Step 6: Commit**

```bash
git add modules/settings/components/CurrentOfferCard.tsx <settings page file>
git commit -m "feat(offer): Current Offer settings card with status + conflict warnings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Offer-lapse reminder cron (`database/migrations/059_offer_lapse_cron.sql`)

**Files:**
- Create: `database/migrations/059_offer_lapse_cron.sql`

**Interfaces:**
- Consumes: existing `notifications`, `workspace_members`, `workspaces` tables + `pg_cron`/`pg_net` extensions.
- Produces: a daily `offer-lapse-check` cron job (pure SQL — no HTTP, so no `app.base_url`/`app.cron_secret` dependency).

- [ ] **Step 1: Write the migration**

Create `database/migrations/059_offer_lapse_cron.sql`:

```sql
-- Daily reminder when a workspace's Current Offer has lapsed. Pure SQL (no HTTP)
-- so it does not depend on app.base_url / app.cron_secret. Notifies workspace
-- admins once (guarded by active_offer.lapse_notified), then sets the flag.

SELECT cron.unschedule('offer-lapse-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'offer-lapse-check'
);

SELECT cron.schedule(
  'offer-lapse-check',
  '0 4 * * *',   -- 04:00 UTC daily (~09:30 IST)
  $$
    WITH lapsed AS (
      SELECT w.id,
             w.settings->'active_offer'->>'name'        AS offer_name,
             w.settings->'active_offer'->>'valid_until' AS valid_until
      FROM public.workspaces w
      WHERE w.settings ? 'active_offer'
        AND (w.settings->'active_offer'->>'valid_until') ~ '^\d{4}-\d{2}-\d{2}$'
        AND (w.settings->'active_offer'->>'valid_until')::date < CURRENT_DATE
        AND COALESCE((w.settings->'active_offer'->>'lapse_notified')::boolean, false) = false
    ),
    notify AS (
      INSERT INTO public.notifications (workspace_id, user_id, type, title, body, data)
      SELECT l.id, m.user_id, 'offer_lapsed',
             'Your offer "' || COALESCE(l.offer_name, '') || '" has expired',
             'Set a new Current Offer or the bot will defer pricing to your team.',
             jsonb_build_object('valid_until', l.valid_until)
      FROM lapsed l
      JOIN public.workspace_members m
        ON m.workspace_id = l.id AND m.role IN ('super_admin', 'admin')
      RETURNING 1
    )
    UPDATE public.workspaces w
    SET settings = jsonb_set(w.settings, '{active_offer,lapse_notified}', 'true'::jsonb)
    WHERE w.id IN (SELECT id FROM lapsed);
  $$
);
```

- [ ] **Step 2: Apply the migration to the live DB**

Apply via a one-off `pg` script (project pattern — reads `SUPABASE_DB_URL` from `.env.local`, imports `pg` by absolute path). Run the file's SQL, then verify:

```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'offer-lapse-check';
```

Expected: one row, `active = true`.

- [ ] **Step 3: Verify behavior against a synthetic lapsed offer (in a transaction, rolled back)**

In a `pg` script, inside `BEGIN … ROLLBACK`:
1. Set a test workspace's `settings.active_offer` to `{name:'T', details:'x', valid_until:'2000-01-01', lapse_notified:false}`.
2. Execute the cron body SQL (the `WITH lapsed … UPDATE …` statement) once.
3. Assert a `notifications` row of type `offer_lapsed` was inserted for each admin member, and `settings->active_offer->>'lapse_notified'` is now `'true'`.
4. `ROLLBACK`.

Expected: notification(s) inserted, flag flips to true, second run inserts nothing (idempotent).

- [ ] **Step 4: Commit**

```bash
git add database/migrations/059_offer_lapse_cron.sql
git commit -m "feat(offer): daily pure-SQL cron reminding admins when an offer lapses

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation

- Run the full suite: `npx vitest run` and `npx tsc --noEmit && npx next build`.
- Push to `origin/main` BEFORE asking the user to redeploy (Coolify builds the pushed commit).
- Tell the user to redeploy (this feature is code, not just data). The `059` cron is already live once applied.

## Self-review notes (coverage vs spec)

- Data model → Task 1 (`ActiveOffer`, `parseActiveOffer`) + Task 3 (write path).
- Offer status (none/active/expired/scheduled, IST) → Task 1 (`computeOfferStatus`) + Task 2 (IST date).
- Reply behavior (offer/guard block, precedence, opt-in) → Task 1 (`buildOfferBlock`/`pricingBlockForSettings`) + Task 2 (wiring).
- UI card (fields, status, warnings) → Task 4.
- API + conflict scan → Task 3 (`findConflictingAmounts` from Task 1).
- Lapse reminder → Task 5.
- Testing (status, extraction, backward-compat, generation) → Task 1 unit tests + Task 2 smoke + existing `ai-reply` tests.
