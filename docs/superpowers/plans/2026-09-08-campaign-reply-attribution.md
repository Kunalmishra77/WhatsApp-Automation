# Campaign Reply Attribution & Campaign-Scoped Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute every WhatsApp campaign reply to the correct campaign exactly once (never a reply that predates its send), stamp a real `messages.campaign_id` link, show a campaign-scoped chat view, make reply counts consistent everywhere, and correct the already-wrong historical data.

**Architecture:** Add the missing `messages.campaign_id` correlation column. Replace three divergent, guess-based attribution code paths (webhook, campaign-executor post-sync, sync-campaign-replies cron) with ONE shared, unit-tested decision rule: an inbound reply attaches to the campaign recipient whose `sent_at <= reply_time` (latest such; exact match when the WhatsApp reply quotes the template), once. Campaign-scoped chat = filter a contact's single shared conversation thread by `campaign_id`. `campaign_recipients.status='replied'` is the single source of truth from which `campaigns.replied_count` is recomputed.

**Tech Stack:** Next.js 15 App Router (route handlers, `runtime='nodejs'`), Supabase Postgres (service-role admin client), TypeScript, Vitest, React Query. Direct DB access for migration + backfill via node `pg` + `SUPABASE_DB_URL` pooler (run scripts from the project dir for `node_modules` resolution; the Bash tool's PATH is broken this session — use the PowerShell tool to run `node`).

**Spec:** This plan is self-contained (bug-fix, design approved in-session). Root-cause evidence: today's VMS campaign "VMS Alibaba Event 02" (`cb182463-2d2e-4f5d-b2bd-bbcb278b6197`, sent 2026-09-08 13:57) shows 236 "replies" of which 193 are timestamped 2026-09-07 18:17 (yesterday) — `replied_at` BEFORE `sent_at`, physically impossible → inherited from the shared conversation via a `completed_at − 24h` lookback window. Yesterday's campaign = "VMS Alibaba" (`a08083d9-486f-4bcc-9fff-8b42caef162c`). VMS workspace = `8a196458-5c09-4403-83e4-23505d0084d7`.

## Global Constraints

- **One conversation per contact stays** (`conversations` UNIQUE `(workspace_id, contact_id)` — live DB index `conversations_workspace_contact_unique`). Do NOT create per-campaign conversations. Campaign separation is achieved via `messages.campaign_id` + a scoped view, never by splitting threads.
- **The send-time guard is absolute:** a reply may only be attributed to a recipient when `reply_time >= recipient.sent_at`. No code path may ever attribute a reply that predates the send.
- **Attribute once:** each inbound reply flips at most one `campaign_recipients` row to `replied`; never re-count or overwrite an already-`replied` row.
- **Single source of truth:** `campaign_recipients.status='replied'` is canonical; `campaigns.replied_count` is always recomputed as `count(*) where status='replied'`.
- **DRY:** all three writers (webhook, executor post-sync, cron) and the backfill call the ONE shared decision function — no divergent copies.
- **Fail-open:** attribution must never throw in a way that breaks the inbound webhook pipeline (wrap in try/catch, log, continue), matching existing `route.ts` behavior.
- **Deploy:** the user redeploys on Coolify from `main`. Push before asking to redeploy. Migration + backfill are applied by us directly against the live DB.
- No demo/placeholder data, no artificial caps, real values only.

---

### Task 1: Migration — `messages.campaign_id`

**Files:**
- Create: `database/migrations/086_messages_campaign_id.sql`

**Interfaces:**
- Produces: `messages.campaign_id uuid null` (FK → `campaigns(id) ON DELETE SET NULL`), index `idx_messages_campaign`.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it to the live DB**

Write `_mig086.mjs` in the project root (reads `SUPABASE_DB_URL` from `.env.local`, runs the SQL), run with the PowerShell tool: `node _mig086.mjs; Remove-Item _mig086.mjs`. Expected: no error; a follow-up `select column_name from information_schema.columns where table_name='messages' and column_name='campaign_id'` returns one row.

- [ ] **Step 3: Regenerate/patch DB types if needed**

Check `types/database.types.ts` for the `messages` Row type; add `campaign_id: string | null` to `Row`, `Insert` (optional), `Update` (optional) so TS compiles. Verify `npx tsc --noEmit` (via PowerShell tool) passes.

- [ ] **Step 4: Commit**

```
git add database/migrations/086_messages_campaign_id.sql types/database.types.ts
git commit -m "feat(campaigns): add messages.campaign_id correlation column (migration 086)"
```

---

### Task 2: Shared attribution rule + unit tests

**Files:**
- Create: `lib/campaign-reply-attribution.ts`
- Test: `tests/campaign-reply-attribution.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RecipientCandidate {
    id: string;
    campaign_id: string;
    sent_at: string | null;          // ISO
    whatsapp_msg_id: string | null;
    status: string;                  // 'sent'|'delivered'|'read'|'replied'|'failed'|'filtered'
  }
  // Chooses the recipient row a reply should be attributed to, or null.
  export function chooseRecipientForReply(
    candidates: RecipientCandidate[],
    replyIso: string,
    quotedWaMsgId?: string | null,
  ): RecipientCandidate | null;
  ```

Rule: (1) keep candidates with `status not in ('replied','filtered','failed')` AND `sent_at != null` AND `sent_at <= replyIso`; (2) if `quotedWaMsgId` matches a candidate's `whatsapp_msg_id`, return it (regardless of recency, still respecting the sent_at guard); (3) else return the candidate with the greatest `sent_at`; (4) ties broken by greatest `id` for determinism; (5) return null if no candidate.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { chooseRecipientForReply, type RecipientCandidate } from '@/lib/campaign-reply-attribution';

const mk = (o: Partial<RecipientCandidate>): RecipientCandidate => ({
  id: 'r1', campaign_id: 'c1', sent_at: '2026-09-08T08:00:00Z', whatsapp_msg_id: null, status: 'sent', ...o,
});

describe('chooseRecipientForReply', () => {
  it('never attributes a reply that predates the send', () => {
    const cands = [mk({ id: 'r1', campaign_id: 'yday', sent_at: '2026-09-07T12:00:00Z' })];
    // reply came at 09-06, before the send -> no attribution
    expect(chooseRecipientForReply(cands, '2026-09-06T12:00:00Z')).toBeNull();
  });

  it('picks the latest send that precedes the reply (today over yesterday)', () => {
    const cands = [
      mk({ id: 'y', campaign_id: 'yday', sent_at: '2026-09-07T12:47:00Z' }),
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z' }),
    ];
    const got = chooseRecipientForReply(cands, '2026-09-08T09:00:00Z');
    expect(got?.id).toBe('t');
  });

  it('attributes to yesterday when the reply came before today\'s send', () => {
    const cands = [
      mk({ id: 'y', campaign_id: 'yday', sent_at: '2026-09-07T12:47:00Z' }),
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z' }),
    ];
    // reply at 09-07 18:17 — only yesterday's send precedes it
    const got = chooseRecipientForReply(cands, '2026-09-07T18:17:00Z');
    expect(got?.id).toBe('y');
  });

  it('prefers the quoted-message match', () => {
    const cands = [
      mk({ id: 'y', campaign_id: 'yday', sent_at: '2026-09-07T12:47:00Z', whatsapp_msg_id: 'wamid.Y' }),
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z', whatsapp_msg_id: 'wamid.T' }),
    ];
    const got = chooseRecipientForReply(cands, '2026-09-08T09:00:00Z', 'wamid.Y');
    expect(got?.id).toBe('y');
  });

  it('skips already-replied / filtered / failed rows', () => {
    const cands = [
      mk({ id: 't', campaign_id: 'today', sent_at: '2026-09-08T08:27:00Z', status: 'replied' }),
    ];
    expect(chooseRecipientForReply(cands, '2026-09-08T09:00:00Z')).toBeNull();
  });

  it('ignores rows with null sent_at', () => {
    const cands = [mk({ id: 't', sent_at: null })];
    expect(chooseRecipientForReply(cands, '2026-09-08T09:00:00Z')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure** — PowerShell: `npx vitest run tests/campaign-reply-attribution.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/campaign-reply-attribution.ts
export interface RecipientCandidate {
  id: string;
  campaign_id: string;
  sent_at: string | null;
  whatsapp_msg_id: string | null;
  status: string;
}

const TERMINAL = new Set(['replied', 'filtered', 'failed']);

/**
 * Decide which campaign_recipients row an inbound reply belongs to.
 * Absolute guard: a reply can only attach to a send that already happened
 * (sent_at <= replyIso). Prefers an exact quoted-template match, else the
 * most recent qualifying send. Returns null when nothing qualifies.
 */
export function chooseRecipientForReply(
  candidates: RecipientCandidate[],
  replyIso: string,
  quotedWaMsgId?: string | null,
): RecipientCandidate | null {
  const replyMs = Date.parse(replyIso);
  if (Number.isNaN(replyMs)) return null;

  const eligible = candidates.filter((c) => {
    if (TERMINAL.has(c.status)) return false;
    if (!c.sent_at) return false;
    const sentMs = Date.parse(c.sent_at);
    return !Number.isNaN(sentMs) && sentMs <= replyMs;
  });
  if (eligible.length === 0) return null;

  if (quotedWaMsgId) {
    const quoted = eligible.find((c) => c.whatsapp_msg_id && c.whatsapp_msg_id === quotedWaMsgId);
    if (quoted) return quoted;
  }

  return eligible.reduce((best, c) => {
    const bMs = Date.parse(best.sent_at as string);
    const cMs = Date.parse(c.sent_at as string);
    if (cMs > bMs) return c;
    if (cMs === bMs && c.id > best.id) return c;
    return best;
  });
}
```

- [ ] **Step 4: Run tests** — PowerShell: `npx vitest run tests/campaign-reply-attribution.test.ts` → all PASS.

- [ ] **Step 5: Commit**

```
git add lib/campaign-reply-attribution.ts tests/campaign-reply-attribution.test.ts
git commit -m "feat(campaigns): shared, tested reply-attribution rule (send-time guarded)"
```

---

### Task 3: Webhook — correct real-time attribution + stamp `messages.campaign_id`

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts:431-535` (the `// ── Campaign reply detection ──` block)

**Interfaces:**
- Consumes: `chooseRecipientForReply` (Task 2), `messages.campaign_id` (Task 1).
- In scope at this point in the file: `supabase` (admin client), `workspaceId`, `contactId`, `waId` (sender phone), `conversation` (`{id,...}`), `msg` (raw WhatsApp message; `msg.context?.id` is the quoted-message wamid), `content`, and the inbound `messages` insert happened earlier (~`route.ts:327-361`).

- [ ] **Step 1: Add the import** at the top of the file with the other `@/lib` imports:

```ts
import { chooseRecipientForReply, type RecipientCandidate } from '@/lib/campaign-reply-attribution';
```

- [ ] **Step 2: Replace the lookup (`route.ts:436-462`)** — fetch ALL recipient rows for this contact/phone (not just non-replied), so "latest send preceding the reply" can be computed, then apply the rule:

```ts
    const replyIso = new Date(parseInt(msg.timestamp, 10) * 1000).toISOString();
    const quotedWaMsgId: string | null = msg.context?.id ?? null;

    // Fetch this contact's recipient rows (by contact_id, else by phone for CSV/manual sends).
    let candidates: RecipientCandidate[] = [];
    {
      const { data: byContact } = await (supabase as any)
        .from('campaign_recipients')
        .select('id, campaign_id, sent_at, whatsapp_msg_id, status, conversation_id')
        .eq('contact_id', contactId)
        .eq('workspace_id', workspaceId);
      candidates = (byContact ?? []) as RecipientCandidate[];
      if (candidates.length === 0 && waId) {
        const { data: byPhone } = await (supabase as any)
          .from('campaign_recipients')
          .select('id, campaign_id, sent_at, whatsapp_msg_id, status, conversation_id')
          .eq('phone', waId)
          .eq('workspace_id', workspaceId);
        candidates = (byPhone ?? []) as RecipientCandidate[];
      }
    }

    const chosen = chooseRecipientForReply(candidates, replyIso, quotedWaMsgId);
    const pendingCr = chosen
      ? (candidates.find((c) => c.id === chosen.id) as any)
      : null;
```

- [ ] **Step 3: Keep the retroactive campaign-message save (`route.ts:464-494`)** but stamp `campaign_id` on that inserted outbound message. In the `.insert({...})` object add:

```ts
            campaign_id:     pendingCr.campaign_id,
```

- [ ] **Step 4: Guard attribute-once + stamp the inbound reply's `campaign_id` (`route.ts:505-533`).** Replace the update block with:

```ts
      const isButton = msg.type === 'button' || msg.type === 'interactive';
      const replyText = msg.type === 'button'
        ? (msg.button?.text ?? content)
        : msg.type === 'interactive'
        ? (msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? content)
        : content;

      // Attribute-once: only flip a row that isn't already replied.
      if (pendingCr.status !== 'replied') {
        const { error: crUpdateErr } = await (supabase as any)
          .from('campaign_recipients')
          .update({
            status: 'replied',
            replied_at: replyIso,
            reply_type: isButton ? 'button' : 'text',
            reply_text: replyText ?? null,
            conversation_id: conversation?.id ?? null,
          })
          .eq('id', pendingCr.id)
          .neq('status', 'replied'); // race-safe once-only

        if (crUpdateErr) {
          console.error('[Webhook] Campaign reply update error:', crUpdateErr.message, 'cr_id:', pendingCr.id);
        } else {
          // Stamp the inbound message with the campaign it replied to (best-effort).
          if (conversation?.id && msg.id) {
            void (supabase as any).from('messages')
              .update({ campaign_id: pendingCr.campaign_id })
              .eq('conversation_id', conversation.id)
              .eq('whatsapp_msg_id', msg.id)
              .then(() => {}, () => {});
          }
          // Denormalized source_campaign_id: keep first-touch behavior.
          void (supabase as any).from('conversations')
            .update({ source_campaign_id: pendingCr.campaign_id })
            .eq('id', conversation.id).is('source_campaign_id', null).then(() => {}, () => {});

          // Recompute canonical replied_count.
          const { count: repliedCount } = await (supabase as any)
            .from('campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', pendingCr.campaign_id)
            .eq('status', 'replied');
          void (supabase as any).from('campaigns')
            .update({ replied_count: repliedCount ?? 0 })
            .eq('id', pendingCr.campaign_id);
        }
      }
```

Note: `msg.id` is the inbound WhatsApp message id and was stored as `whatsapp_msg_id` on the inbound `messages` row earlier in the handler — confirm that field name when implementing (search the earlier insert ~`route.ts:327-361`); if the inbound row uses a different var, match it.

- [ ] **Step 5: Typecheck + targeted test** — PowerShell `npx tsc --noEmit` passes. (No unit test for the webhook itself; the rule is covered in Task 2. Manual verification happens in Task 7.)

- [ ] **Step 6: Commit**

```
git add app/api/webhooks/whatsapp/route.ts
git commit -m "fix(campaigns): webhook attributes replies with send-time guard + stamps messages.campaign_id"
```

---

### Task 4: Batch syncs — executor post-completion + cron — apply the guard, drop the 24h window

**Files:**
- Modify: `lib/campaign-executor.ts:939-1025` (post-completion reply sync)
- Modify: `app/api/cron/sync-campaign-replies/route.ts:47-145`

**Interfaces:**
- Consumes: `messages.campaign_id` (Task 1). Both syncs already have `db` (admin client), the campaign, and iterate non-replied recipients.

The bug in both: `campStart = completed_at − 24h` (executor uses `now − 24h`), then they take the **earliest inbound per conversation since campStart** and stamp it as the reply — which reaches into the previous day. Fix: bound the inbound lookup by **each recipient's own `sent_at`**, and stamp `campaign_id` on the matched inbound message.

- [ ] **Step 1 (executor):** In `campaign-executor.ts`, change the non-replied recipient fetch (`:950-954`) to also select `sent_at`:

```ts
        const { data: page } = await db.from('campaign_recipients')
          .select('id, phone, sent_at')
          .eq('campaign_id', campaignId)
          .not('status', 'in', '(replied,filtered,failed)')
          .range(syncOffset, syncOffset + 999);
```

- [ ] **Step 2 (executor):** Replace the `campStart` lower bound (`:945`) with the campaign's own earliest send, so the window can never reach into a prior campaign day:

```ts
      // Lower bound = the earliest send in THIS campaign. A reply can never predate its send,
      // so we never look before it (this is what stopped yesterday's replies leaking in).
      const { data: firstSend } = await db.from('campaign_recipients')
        .select('sent_at').eq('campaign_id', campaignId).not('sent_at', 'is', null)
        .order('sent_at', { ascending: true }).limit(1).maybeSingle();
      const campStart = firstSend?.sent_at ?? new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
```

- [ ] **Step 3 (executor):** In the per-conversation match loop (`:996-1013`), after resolving `cr2` and the earliest inbound `m`, add a per-recipient guard and stamp `campaign_id`:

```ts
          const cr2 = batch.find((r) => r.phone === phone2);
          if (!cr2) continue;
          // Guard: the reply must not predate this recipient's own send.
          if (cr2.sent_at && new Date(m.created_at).getTime() < new Date(cr2.sent_at).getTime()) continue;

          const isBtn = m.type === 'text' && m.metadata?.button_reply;
          await db.from('campaign_recipients').update({
            status: 'replied',
            replied_at: m.created_at,
            reply_type: isBtn ? 'button' : 'text',
            reply_text: (isBtn ? m.metadata.button_reply.text : m.content)?.slice(0, 500) ?? null,
            conversation_id: convId2,
          }).eq('id', cr2.id).neq('status', 'replied');
          // Stamp the matched inbound message with the campaign.
          void db.from('messages').update({ campaign_id: campaignId })
            .eq('conversation_id', convId2).eq('created_at', m.created_at).is('campaign_id', null)
            .then(() => {}, () => {});
          syncUpdated++;
```

(Select `id` on the msgs query so a more precise `.eq('id', m.id)` stamp is possible — update the `.select` at `:983` to `'id, conversation_id, content, type, created_at, metadata'` and stamp by `m.id` instead of `created_at`.)

- [ ] **Step 4 (cron):** Apply the identical three changes to `sync-campaign-replies/route.ts`: select `sent_at` on the recipient fetch (`:57-61`), replace `campStart` (`:48-50`) with this campaign's earliest send, select `id` on the msgs query (`:95-102`), and in the match loop (`:116-129`) add the `m.created_at >= cr.sent_at` guard, `.neq('status','replied')`, and the `messages.campaign_id` stamp by `m.id`. (The cron's `campStart` currently derives from `completed_at`; replace with the earliest-send lookup shown in Step 2, keyed to `camp.id`.)

- [ ] **Step 5: Typecheck** — PowerShell `npx tsc --noEmit` passes.

- [ ] **Step 6: Commit**

```
git add lib/campaign-executor.ts app/api/cron/sync-campaign-replies/route.ts
git commit -m "fix(campaigns): batch reply syncs bounded by per-recipient sent_at (no 24h back-window) + stamp campaign_id"
```

---

### Task 5: Stamp `campaign_id` on outbound campaign sends

**Files:**
- Modify: `lib/campaign-executor.ts:851-931` (batch conversation + outbound message creation)

**Interfaces:**
- Consumes: `messages.campaign_id` (Task 1). `campaignId` is in scope.

- [ ] **Step 1:** In the outbound message row built for each recipient (`campaign-executor.ts:~915-925`, the object with `sender_type:'campaign'`), add:

```ts
        campaign_id: campaignId,
```

- [ ] **Step 2: Typecheck** — PowerShell `npx tsc --noEmit` passes.

- [ ] **Step 3: Commit**

```
git add lib/campaign-executor.ts
git commit -m "feat(campaigns): stamp campaign_id on outbound campaign messages"
```

---

### Task 6: Campaign-scoped chat view

**Files:**
- Modify: `modules/conversations/services/message.service.ts:9-27` (`fetchMessages`)
- Modify: `modules/conversations/hooks/useMessages.ts:13-67` (`useMessages`)
- Modify: `modules/conversations/components/ChatWindow/index.tsx` (read a `campaignId` prop / search param, pass to `useMessages`; realtime INSERT handler must respect the filter)
- Modify: `modules/campaigns/components/CampaignDetail/index.tsx:257-263` (route with `?campaign=<id>`)

**Interfaces:**
- Consumes: `messages.campaign_id` (Task 1), populated by Tasks 3–5 + backfill (Task 7).
- Produces: `fetchMessages(conversationId, page, campaignId?)`; `useMessages(conversationId, campaignId?)`.

- [ ] **Step 1:** `fetchMessages` — add optional `campaignId` and filter:

```ts
export async function fetchMessages(
  conversationId: string,
  page = 0,
  campaignId?: string | null,
): Promise<MessageRow[]> {
  const supabase = createClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false);
  if (campaignId) q = q.eq('campaign_id', campaignId);
  const { data, error } = await q.order('created_at', { ascending: false }).range(from, to);

  if (error) throw error;
  return (data ?? []).reverse() as MessageRow[];
}
```

- [ ] **Step 2:** `useMessages(conversationId, campaignId?)` — thread `campaignId` into the query key + queryFn, and make the realtime INSERT handler only append messages matching the filter (a new message's `campaign_id` may lag, so also invalidate on INSERT when scoped):

```ts
export function useMessages(conversationId: string, campaignId?: string | null) {
  const queryClient = useQueryClient();
  const key = ['messages', conversationId, campaignId ?? 'all'];

  const query = useQuery<MessageRow[]>({
    queryKey: key,
    queryFn: () => fetchMessages(conversationId, 0, campaignId ?? undefined),
    enabled: !!conversationId,
    staleTime: 30_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });
  // ...realtime effect: in the INSERT handler, if campaignId is set and
  // newMsg.campaign_id !== campaignId, skip the optimistic add and instead
  // void queryClient.invalidateQueries({ queryKey: key }); UPDATE handler unchanged
  // but keyed on `key`.
```

Keep the existing `['messages', conversationId]` (unscoped) usages working — `useSendMessage`/optimistic writes target the unscoped key; when scoped, invalidate both keys on send so the scoped view refreshes.

- [ ] **Step 3:** `ChatWindow` — read the campaign scope. If it renders inside the conversations route, read `useSearchParams().get('campaign')`; pass it to `useMessages`. Show a small banner when scoped: "Showing messages for this campaign only · View full conversation" linking to the same conversation without the `?campaign=` param.

- [ ] **Step 4:** `CampaignDetail` open-chat button (`:257-263`) — route with the campaign scope:

```tsx
    onClick={() => router.push(`/conversations/${r.conversation_id}?campaign=${campaignId}`)}
```

(`campaignId` is the current campaign's id in that component — confirm the prop/param name when implementing.)

- [ ] **Step 5: Typecheck + build** — PowerShell `npx tsc --noEmit` passes; if quick, `npm run build` the conversations route.

- [ ] **Step 6: Commit**

```
git add modules/conversations/services/message.service.ts modules/conversations/hooks/useMessages.ts modules/conversations/components/ChatWindow/index.tsx modules/campaigns/components/CampaignDetail/index.tsx
git commit -m "feat(campaigns): campaign-scoped chat view via messages.campaign_id"
```

---

### Task 7: One-time data correction (live DB) + verify

**Files:**
- Create (scratch, project root, deleted after): `_backfill_campaign_replies.mjs`

**Interfaces:**
- Consumes: the shared rule's logic (re-implement inline in the script, matching `chooseRecipientForReply`), `messages.campaign_id`.

Goal: re-derive the correct reply state for recent campaigns across ALL clients, and stamp historical `messages.campaign_id`. Per campaign, per contact: reset the wrongly-inherited replies and recompute against the send-time guard.

- [ ] **Step 1: Write the backfill** (idempotent). For each campaign with `completed_at >= now() - interval '30 days'` (all workspaces):
  1. Stamp outbound campaign sends: `update messages m set campaign_id = cr.campaign_id from campaign_recipients cr where cr.campaign_id = <camp> and m.conversation_id = cr.conversation_id and m.sender_type='campaign' and m.whatsapp_msg_id = cr.whatsapp_msg_id and m.campaign_id is null`.
  2. Clear wrongly-stamped replies for this campaign where `replied_at < sent_at` (impossible): set `status` back to its delivered/sent value, `replied_at=null, reply_text=null, reply_type=null`. Determine the pre-reply status from `read_at`/`delivered_at` (`read`→'read', else `delivered_at`→'delivered', else 'sent').
  3. Re-attribute: for each contact in the campaign, gather ALL their recipient rows (across campaigns) + the conversation's inbound messages; for each inbound message in time order, apply `chooseRecipientForReply` over rows not yet replied; flip exactly once; set `messages.campaign_id` on that inbound. (Process inbound oldest→newest so earlier sends get their reply before later ones.)
  4. Recompute `campaigns.replied_count = count(status='replied')`.

- [ ] **Step 2: Dry-run** the script with a `DRY=1` flag that prints, for the two VMS campaigns, the before/after replied counts and how many rows would be cleared — WITHOUT writing. Run via PowerShell `node _backfill_campaign_replies.mjs` (DRY). Expected: today's VMS campaign drops from 236 → ~43; yesterday's stays ~ its genuine count.

- [ ] **Step 3: Apply** for real (all clients, last 30 days). Re-run the earlier diagnostic queries to confirm: for today's VMS campaign, `count(*) where replied_at < sent_at` = 0; `campaigns.replied_count == count(status='replied')`; today's repliers no longer include yesterday's 18:17 rows.

- [ ] **Step 4: Delete the scratch script** (`Remove-Item _backfill_campaign_replies.mjs`). Nothing to commit (data-only).

---

## Verification (whole-branch)

- [ ] `npx tsc --noEmit` clean; `npx vitest run tests/campaign-reply-attribution.test.ts tests/billing.test.ts lib/onboarding-state.test.ts` all pass.
- [ ] Live DB: today's VMS campaign has no `replied_at < sent_at` rows; the three counts (`campaigns.replied_count`, `campaign_recipients status='replied'`, and the Replies tab) agree.
- [ ] Push `main`; user redeploys on Coolify; then together: open today's VMS campaign → Replies shows only genuine post-13:57 replies; open a chat from it → shows only that campaign's messages, not yesterday's.
