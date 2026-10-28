# Flow Builder v2 — Design

**Date:** 2026-10-28
**Status:** design agreed in chat; every decision below is the author's call, not the user's

## Intent

The flow builder should be able to express any automation a client asks for, and a
client should be able to build one without help. Today neither is true, and the two
problems have different causes.

The user's words: *"har tarah ka flow, har type ka flow yaha ban sake, also clients
easily bana sake"* — and, on what "advanced" means, *"hme utna to nhi pata"*. So the
feature list below is the author's, built from what the twelve live workspaces actually
tried to build and where the engine stopped them.

## What is true today

Eighteen flows exist across the twelve workspaces. They are the only evidence of what
clients want, so the gaps are read from them rather than from a feature checklist.

- **Eight of the eighteen are two to four nodes: one auto-reply.** These clients opened
  a node canvas to write a single message. The canvas is the wrong tool for the most
  common job.
- **All eighteen trigger on a keyword** (one on first message). No client has ever had
  another option.
- **Three flows are named "Nurture Flow" and cannot nurture.** There is no wait node, so
  every message in them fires in the same second.
- **Four Razorveda flows are active at once with different keywords.** The engine takes
  the first match from an unordered query, so which one wins is not defined.

Three things are worse than missing:

1. **Reply buttons work in the engine and are absent from the editor.** `executeNode`
   sends `interactive` button messages when a question node carries `buttons`, with
   optional `header` and `footer`. No editor field sets them, so no client has ever used
   WhatsApp's tap-to-reply. (`lib/flow-engine.ts`, the `question` case.)
2. **"Timeout (hours)" is a lie.** The editor collects `timeoutHours`, every flow stores
   it, and nothing reads it. A single cron expires any session idle for 48 hours.
3. **Two clients are hard-coded into the shared engine.** `isOffTopicReply` tests for
   `pagarbook`, and `notifyGoogleSheets` builds a payload from VMS's field names
   (`business_employee_count`, `attendance_method`, `calculator_person`, `demo_date`…).
   Every other workspace's flow therefore pushes empty columns to its own sheet.

One thing is better than expected: **`time_trigger_queue` and its cron already run.**
Scheduled work has infrastructure; the wait node is a consumer of something that exists,
not a new subsystem.

## Goals

- Any automation a client describes can be built from the palette, without code.
- A client who has never seen a flowchart can build and ship a working flow alone.
- A flow can be tried before a customer ever touches it.
- Nothing that runs today changes behaviour unless its author edits it.

## Non-goals

- No visual rewrite of the canvas. React Flow stays.
- No new flow-session storage. The eighteen live flows and their open sessions keep
  working against the same `chatbot_flows.nodes` / `.edges` / `flow_sessions.context`
  shapes.
- No branching into Instagram or other channels here. WhatsApp only; the node handler
  interface leaves room for a second channel later without promising one.

## Anti-goals

Things that would make this a failure even if every feature shipped:

- A palette so large that the eight single-reply clients are worse off than today.
- A flow that is silently broken and looks fine, which is the bug that started this.
- Any client-specific name or field left inside shared code.

## Constraints

- Multi-tenant: every node, trigger and action is scoped to one workspace. No node may
  read or write another workspace's rows.
- WhatsApp's own limits are the ceiling: 3 reply buttons, 10 list rows, a 24-hour
  customer-service window after which only an approved template may open a conversation.
- Live sessions must survive a deploy mid-flow. Context keys keep the existing
  `name` / `name_text` pair rather than moving to a new shape.
- AI calls cost money per workspace and a provider has gone down before. Every AI-backed
  node fails open: the flow proceeds, it does not stall.

## Architecture

### One data model, two views

The single most important decision. `chatbot_flows` keeps storing nodes and edges. On
top of it:

- **Guided view** (new, the default for a new flow) — a vertical list of steps:
  *when this happens → send this → ask this → do this*. Add, reorder, delete. It reads
  and writes the same nodes and edges, laying them out on a single spine.
- **Canvas view** (today's React Flow editor) — for branching, loops and anything the
  list cannot express.

A flow built in the Guided view opens correctly in the canvas. A flow whose shape the
list cannot represent — a branch, a jump, a cycle — opens read-only in the list with one
line saying so and a button to switch. Switching views never rewrites the stored flow.

This is what serves both halves of the request at once: the list is why a client can
build alone, the canvas is why anything is possible.

### A node handler registry

`executeNode` is a `switch` that grows with every node type, and each case repeats the
same four steps: do the thing, find the next node, advance the session, recurse. With
fifteen node types that becomes the place bugs live.

Replace it with one handler per node type in `lib/flow-nodes/<type>.ts`, each exporting:

```ts
interface NodeHandler {
  type: string;
  // Runs the node. Returns where control goes next.
  run(ctx: NodeRunContext): Promise<NodeResult>;
  // Pure: what this node needs and provides, for the validator and the simulator.
  describe?(data: unknown): { readsVars: string[]; writesVars: string[] };
}

type NodeResult =
  | { next: 'edge'; handle?: string }   // follow an outgoing edge
  | { next: 'wait' }                    // park the session on this node
  | { next: 'goto'; nodeId: string }    // jump
  | { next: 'end' }
  | { next: 'handoff' };                // park and hand to a human
```

`NodeRunContext` carries the supabase client, workspace, conversation, session, contact,
the incoming message, the flow context and a `send` facade. The engine owns edge
resolution, session advancement, loop guarding and recursion; a handler never calls
`executeNode`.

Adding a node type is then one file plus one registry line plus one editor panel — which
is the property that makes "every kind of flow" sustainable rather than a one-time push.

### Branching

`findNextNode` returns the first edge whose source matches, ignoring the handle unless
one is passed. A node with two outgoing edges therefore picks one at random-ish and the
author is never told. Fix: every handler names the handle it wants, every multi-outcome
node declares its handles, and a node with more outgoing edges than handles is a
validation warning. The existing `yes` / `no` condition handles keep their names.

### Variables

`FlowContext` is `Record<string, number | string>` where a question writes both `x` (a
parsed integer) and `x_text` (the raw reply). It is ugly and it is load-bearing for
eighteen flows and every open session. It stays.

What is added: a `system.` namespace populated at session start and refreshed each turn —
`system.contact_name`, `system.phone`, `system.workspace_name`, `system.last_reply`,
`system.date`, `system.time`, `system.ad_name`, `system.lead_temperature`,
`system.tags`. Interpolation resolves `{{system.contact_name}}`; existing `{{name}}`
lookups are untouched. This closes the complaint behind the warning shipped in
`lib/flow-validate.ts`: today a flow has no variable it did not ask for, so every
greeting has to open with "may I know your name?".

### Timeouts

`timeoutHours` starts being read. When a question or collect node parks a session, the
engine enqueues a `time_trigger_queue` row at `now + timeoutHours`. When it fires and the
session is still parked on that node, control follows the node's `timeout` handle if one
is wired, otherwise the session expires as it does today. A reply before then cancels the
row. The 48-hour sweep stays as the backstop.

## The palette

Six node types exist: start, message, question, condition, assign_agent, end. Nine are
added. Each entry says what it unlocks that is impossible today.

**Wait** — delay by minutes, hours or days, or until a time of day or a weekday. Backed by
`time_trigger_queue`. Unlocks every nurture and follow-up flow, including the three that
are already named for it.

**Media** — image, video, document or audio with a caption, from the workspace's media
library or a URL; and a location pin. Unlocks a gym's plan PDF, a clinic's directions, a
D2C product photo.

**Buttons** — up to 3 reply buttons, each with its own outgoing branch. Mostly exposing
what the engine already sends; the new part is a branch per button instead of matching
the reply text with a condition.

**List** — up to 10 rows in sections, each row its own branch. Unlocks a service menu,
which today has to be typed out and parsed by keyword.

**Template** — send an approved WhatsApp template with its variables filled from context.
The only way to re-open a conversation after 24 hours of silence, so wait-then-follow-up
is impossible without it.

**AI Reply** — hand this one turn to the workspace's persona and knowledge base,
optionally scoped to a topic, then return to the flow. Unlocks "answer whatever they ask,
then carry on booking", which today requires leaving the flow entirely.

**Action** — one node, one or more operations: add or remove a tag, set lead temperature
or score, set a contact field, assign to a team member or team, create a task with a due
date, notify the team by WhatsApp or email, add to a campaign, opt out or block. Unlocks
everything a flow should *do* rather than say. Today a flow can only talk and hand off.

**Webhook** — POST the flow context to a URL and optionally read JSON fields back into
variables, with a timeout and a failure branch. This is the deliberate escape hatch: it
is what makes "any flow" true for the cases this document did not foresee, and it is also
how per-workspace Google Sheets stops being hard-coded.

**Switch** — branch many ways on a variable or the last reply, with a default branch.
`condition` stays for yes/no.

**Collect** — a question with an expected type (name, phone, email, number, date, time,
one-of-a-list), its own re-ask message, a maximum number of attempts and an outgoing
branch for giving up. Unlocks validated input; today a flow accepts "asdf" as a phone
number, and re-asking is faked with `forceAsk`.

**Jump** — go to another node, or start another flow. Unlocks reuse: one booking
sub-flow called from five entry points.

**Split** — percentage branch, for trying two versions of a message.

Deferred, each blocked on something outside this work, and each listed so the palette's
shape accounts for it: **Payment** (a UPI or Razorpay link — blocked on the live-payments
website registration), **Form** (a native Meta in-chat form — blocked on client WABA
business verification), **Sheets** (a first-class Google Sheets node — blocked on the
native OAuth backlog; until then the Webhook node covers it).

## Triggers

Every flow today triggers on a keyword substring or the contact's first message. The
start node gains:

- keyword, with exact / contains / starts-with, and a list of phrases rather than one
- a button or list reply id, and a template button click
- an ad click, by ad or campaign id — the platform already recovers CTWA attribution,
  so a flow can finally answer "which ad did they come from" differently per ad
- a lead event: created, tag added or removed, temperature changed
- conversation idle for N hours — the no-reply follow-up
- a scheduled date and time
- a campaign reply
- manual or API trigger, for testing and for the simulator
- any message, as an explicit fallback

Two properties are added alongside, because with this many triggers the current
first-match-wins becomes untenable:

- **priority** — an integer on the flow; matching is ordered by it, then by age. This
  fixes the four-Razorveda-flows race that exists today.
- **active window** — optional business hours and weekdays, so an after-hours flow and a
  working-hours flow can share a trigger.

## Making it buildable

Half the request, and the half that is easy to drop. Each item below is aimed at a
specific observed failure.

**Guided view** (described above) — aimed at the eight clients who used a canvas to write
one message.

**Simulator** — a panel beside the builder: type a customer's replies, watch the flow
run, see each node highlight as it executes and each variable fill. Nothing is sent to
WhatsApp. This is the largest single cause of "confusion hota hai": today the only way to
test a flow is to message a client's live number from a real phone, and the only way to
find a mistake is a customer hitting it. The Fitness First flow that fired every message
at once would not have survived one simulator run.

**Validation, extended** — `lib/flow-validate.ts` now warns on a condition with no
question above it and on a `{{variable}}` nothing saves. Add: unreachable nodes, dead
ends, empty messages, a node with more edges than handles, two active flows sharing a
trigger, a referenced template that no longer exists, a variable read before it is
written, and a wait node that would push a message outside the 24-hour window without a
template.

**Plain-language summary** — a readable Hinglish paragraph of what the flow does, above
the builder. *"Customer 'Book Now' likhega → 2 message jayenge → naam poochha jayega →
agent ko assign ho jayega."* Derived from the nodes, so it cannot drift from them. It is
also the fastest way for a client to see that a flow is wrong.

**Vertical template packs** — the five existing presets are generic. Add packs with real
copy in Hindi and English for the businesses actually on the platform: gym, clinic and
hospital, salon and spa, resort, jewellery and D2C, real estate, coaching, software demo.
Each one is a starting point to edit, not a black box.

**AI builder, repaired** — `/api/flows/generate` knows only the six current node types
and currently returns a 502 that has not been reproduced. It is rewritten against the new
palette, and its output goes through the validator before it is shown, so a generated
flow cannot arrive broken.

**Duplicate, version history, rollback** — a client who breaks a live flow can get the
previous version back. Flows are edited in production by non-technical people; this is
the safety net that makes the rest safe to use.

## Cleanups this work must include

Not optional, because the above cannot be called correct while they stand:

- `pagarbook` removed from `isOffTopicReply`; per-workspace off-topic hints instead.
- `notifyGoogleSheets`'s VMS column names replaced by a per-workspace field mapping, so
  the other eleven workspaces stop sending empty columns.
- `timeoutHours` either enforced (above) or removed from the editor. It is enforced.
- Flow trigger matching ordered, not arbitrary.

## Phases

Ordered by value delivered per unit of risk, each phase independently shippable and
each ending with a deploy the user can look at.

**Phase 1 — the palette's missing half, on existing infrastructure.** Node handler
registry; Buttons and List; Wait; Media; Action; real per-node timeouts; handle-correct
branching; `system.` variables; per-workspace Sheets mapping; `pagarbook` removed;
trigger priority. Nothing here needs a new subsystem, and it converts the three fake
nurture flows into real ones.

**Phase 2 — buildable by a client.** Guided view; simulator; extended validation;
plain-language summary; vertical template packs.

**Phase 3 — power and safety.** Template, AI Reply, Webhook, Switch, Collect, Jump,
Split; the richer triggers; active windows; flow analytics with per-node drop-off;
version history and rollback; the repaired AI builder.

## Testing

Each node handler is pure enough to test without a database: `run()` takes a context and
returns a result, so a handler test asserts the result and the calls made against a fake
`send` facade. The existing `tests/flow-engine.test.ts` and `lib/flow-validate.test.ts`
stay and must keep passing unchanged — they are the regression net for the eighteen live
flows.

Two things get an integration test against a seeded workspace rather than a unit test:
the wait node's enqueue-and-fire round trip through `time_trigger_queue`, and the
timeout-handle path.

## What is left to the builder

- The Guided view's exact step vocabulary and the rule for when a flow is too branched
  to show as a list. The constraint is that switching views never rewrites the flow.
- Whether the simulator runs the real handlers against a fake `send` facade or a separate
  interpreter. Preference: the real handlers, so the simulator cannot disagree with
  production.
- Editor panel layout per node type, following the existing `NodeConfigPanel` patterns.
- Migration numbering and whether trigger priority lands as a column or inside the
  existing settings JSON. Preference: a column, since matching orders by it.
