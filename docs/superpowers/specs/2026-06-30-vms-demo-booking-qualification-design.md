# VMS Demo Booking Flow — Employee Count Qualification

**Date:** 2026-06-30
**Workspace:** VMS (`workspace_id = 8a196458-5c09-4403-83e4-23505d0084d7`)
**Flow being replaced:** `Demo Booking Flow` (`id = 8f4f5254-e373-4c3c-b290-9d5903abeb1f`, trigger keyword `"demo"`)

## Problem

The current "Demo Booking Flow" linearly asks for staff count, date, time, and location with no qualification logic — every responder proceeds straight to scheduling regardless of company size. We need to insert a qualification gate: only businesses with **≥ 10 employees** continue to scheduling; smaller businesses get a polite rejection message and the flow ends.

The flow builder's Condition node currently only supports keyword text-matching against the raw incoming reply (`contains`/`equals`/`starts_with`). It has no concept of saving a reply as a named variable or doing numeric comparisons, and the `flow_sessions.context` JSONB column that was clearly intended for this exists but is never read or written anywhere in the engine. This must be built.

## Scope

1. Engine support for saving a question reply as a numeric variable, and for condition nodes to numerically compare a saved variable.
2. Flow builder UI support for configuring both of the above (so this is a reusable capability, not a one-off hack).
3. Rebuilding the VMS "Demo Booking Flow" nodes/edges to use the new qualification branch, replacing the flow's existing `nodes`/`edges` in place (same flow id, same trigger).

## 1. Data model changes

`modules/flows/types/index.ts`:

```ts
export interface QuestionNodeData {
  label: string;
  message: string;
  timeoutHours: number;
  saveAsVariable?: string; // NEW — optional. e.g. "employee_count"
}

export interface ConditionNodeData {
  label: string;
  conditionType?: 'keyword' | 'variable_compare'; // NEW — defaults to 'keyword'
  keyword: string;
  matchType: 'contains' | 'equals' | 'starts_with';
  // NEW — only used when conditionType === 'variable_compare'
  variable?: string;
  operator?: '>=' | '>' | '<' | '<=' | '==' | '!=';
  value?: number;
}
```

`conditionType` defaults to `'keyword'` when absent, so all 7 existing template flows and any other live flows keep working unchanged — this is additive, not a breaking schema change. No migration needed; `nodes`/`edges` are already untyped JSONB.

## 2. Engine changes (`lib/flow-engine.ts`)

**Saving a variable on question reply:**

When a `question` node's reply is processed and `node.data.saveAsVariable` is set:
1. Extract the first number from the raw reply text via `/\d+/` regex match.
2. If no digits are found anywhere in the reply, store `0`. This makes "unparseable reply" naturally fail any `>= N` qualification check without a separate code path — it just is the threshold case.
3. Read the session's existing `context` JSONB, merge in `{ [saveAsVariable]: parsedNumber }`, write it back to `flow_sessions.context`.

**Evaluating a variable comparison condition:**

When a `condition` node has `conditionType === 'variable_compare'`:
1. Read `context[node.data.variable]` (default to `0` if the key was never set — e.g., flow reached this condition without passing through the saving question node).
2. Compare against `node.data.value` using `node.data.operator`.
3. Route via the existing `sourceHandle: 'yes' | 'no'` edge lookup — same branching mechanism as keyword conditions, so `findNextNode()` doesn't need to change.

Both new code paths are pure/isolated (parse-number, compare-operator) and should be implemented as small testable helper functions rather than inlined, so they can be unit tested without spinning up the full session/DB flow.

## 3. UI changes

**Question node editor panel** (wherever `QuestionNodeData` is currently edited): add an optional text input, "Save reply as variable (optional)", writing to `data.saveAsVariable`.

**Condition node editor panel**: add a mode toggle at the top — "Match keyword in reply" (existing UI, unchanged) vs. "Compare a saved number" (new). The new mode shows: variable name (plain text input — the user types the same name they used as `saveAsVariable` on the question node), operator dropdown (`>=`, `>`, `<`, `<=`, `==`, `!=`), and a numeric value input.

**Condition node canvas label**: show a one-line summary regardless of mode — e.g. `keyword contains "yes"` or `employee_count >= 10` — so the graph stays readable at a glance.

## 4. New VMS flow content

Replacing `nodes`/`edges` on flow `8f4f5254-e373-4c3c-b290-9d5903abeb1f` (same `id`, `trigger_type: keyword`, `trigger_value: demo`):

```
Start (keyword: "demo")
  → Message: Welcome ("PagarBook demo free hai...")
  → Question: Ask Employee Count (saveAsVariable: "employee_count")
  → Condition: employee_count >= 10
        yes → Question: Ask Date
                → Question: Ask Time
                  → Question: Ask Location
                    → Message: Confirmation (notes + phone numbers)
                      → Handoff to Agent (assign_agent)
        no  → Message: "Minimum 10 employees" rejection  → (terminal, no outgoing edge)
```

Exact copy (WhatsApp uses single-asterisk `*bold*`, not markdown `**bold**`):

- **Welcome:** `🎉 Bilkul! PagarBook ka demo *completely FREE* hai.\n\nHamari team aapke office visit karke sirf *20–30 minutes* mein software ka live demo degi.\n\nKoi hidden charges nahi, koi commitment nahi. 😊`
- **Ask Employee Count:** `👥 Sabse pehle batayein, *aapki company mein kitne employees kaam karte hain?*\n\n(Please enter the approximate number.)`
- **Rejection (< 10):** `🙏 Thank you for your interest in PagarBook.\n\nFilhaal hamara free on-site demo un businesses ke liye available hai jinke paas *minimum 10 employees* hain.\n\nJaise hi aapki team 10 ya usse zyada employees ki ho jaati hai, hume dobara contact karein. Hamari team aapke liye demo schedule kar degi.\n\nDhanyavaad! 😊`
- **Ask Date:** `📅 Demo ke liye aapko kaunsa din convenient rahega?\n\nExample: Kal, Monday, Weekend ya koi specific date.`
- **Ask Time:** `⏰ Kis time demo rakhna convenient rahega?\n\nExample:\n• Morning (10 AM – 1 PM)\n• Afternoon (2 PM – 6 PM)`
- **Ask Location:** `📍 Demo ke liye apne office ka address ya location share karein.`
- **Confirmation:** `✅ Perfect! Humne aapki details note kar li hain.\n\nHamari team aapse jaldi contact karegi aur demo schedule confirm karegi.\n\n📞 9999103866\n📞 8285828645\n\nAgar aapke koi aur questions hain, toh zaroor poochiye. 😊`
- **Handoff:** `Demo request received! Aapki team se jald sampark kiya jayega.`

Layout: keep the existing single-column `x: 250` layout for the main (yes) path with ~150–170px vertical spacing between nodes; offset the rejection node to `x: 550` at the same vertical level as the condition node's "Ask Date" sibling, consistent with the branching style already used in the `FAQ_BOT` template (`lib/flow-templates.ts`).

## 5. Error handling / edge cases

- Reply with no digits at all (e.g. "bahut log hain") → stored as `0` → routes to rejection branch. This was an explicit, accepted trade-off (favor a safe default over re-prompting).
- Reply with a range or extra text (e.g. "8-10 log", "around 15") → first number extracted (`8`, `15`) is used.
- A condition node reaching `variable_compare` evaluation before its variable was ever saved (e.g. flow edited to skip the question node) → defaults to `0`, routes to rejection branch rather than crashing.
- Existing flows using keyword conditions are unaffected: `conditionType` defaults to `'keyword'`, so `matchesCondition()`'s current logic path is preserved unless a flow explicitly opts into `variable_compare`.

## 6. Testing

No automated test harness exists for `lib/flow-engine.ts` today. Plan:
- Unit tests for the two new pure helpers (number extraction, operator comparison) covering: clean integer, number embedded in text, no digits, negative/zero edge values, each of the 6 operators.
- Manual verification of the rebuilt VMS flow end-to-end (both branches: a ≥10 reply and a <10 reply, plus one unparseable reply) using a live/sandboxed WhatsApp conversation, since the flow engine is triggered by real inbound webhook messages and there's no existing flow-simulation tooling to drive it headlessly.
