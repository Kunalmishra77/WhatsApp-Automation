// lib/flow-validate.ts
//
// Catches the two ways a flow can be saved looking correct and then not work.
// Both were found in a live client flow that fired every message at once on the
// trigger keyword, and the editor had let it be built and saved without comment.
//
// 1. A condition with no question before it. A condition judges whatever the
//    customer last sent, and only a question node stops to collect that. Reached
//    without one, it judges the message that triggered the flow — so a "did they
//    say yes?" branch tests the keyword instead of an answer, and takes the same
//    path every time.
//
// 2. A {{variable}} nothing saves. Placeholders resolve against answers captured
//    by question nodes, and an unknown one becomes an empty string in silence.
//    "Thank You, {{name}}!" went out as "Thank You, !" because no node saved a
//    name.
//
// These are warnings, not errors. A half-built flow is a normal thing to save,
// and a validator that blocks the save would be worse than the bug it prevents.

// `data` is read as unknown on purpose: a flow's nodes come back out of a JSONB
// column, so nothing guarantees the shape the editor's types promise.
export interface ValidatableNode {
  id: string;
  type?: string;
  data?: unknown;
}
export interface ValidatableEdge {
  source: string;
  target: string;
}

function field(node: ValidatableNode, key: string): unknown {
  if (!node.data || typeof node.data !== 'object') return undefined;
  return (node.data as Record<string, unknown>)[key];
}

function text(node: ValidatableNode, key: string): string | undefined {
  const v = field(node, key);
  return typeof v === 'string' ? v : undefined;
}

export interface FlowWarning {
  nodeId: string;
  kind:
    | 'condition_without_question'
    | 'unsaved_variable'
    | 'unknown_system_variable'
    | 'variable_used_too_early'
    | 'unreachable'
    | 'dead_end'
    | 'empty_copy'
    | 'media_without_file'
    | 'template_not_chosen'
    | 'wait_past_the_window'
    // Produced at save time by lib/flow-validate-db.ts, which needs the
    // workspace's other flows and its template list. Same type on purpose, so
    // the editor renders them in the one list the author already reads.
    | 'trigger_never_fires'
    | 'trigger_shadows_another'
    | 'template_missing'
    | 'template_not_approved';
  message: string;
}

// The dot is deliberate: the engine interpolates {{system.contact_name}}, and a
// pattern without it would quietly ignore every system placeholder — including
// a misspelt one.
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Seeded by the engine at session start. Keep in step with buildSystemVars. */
const SYSTEM_VARS: ReadonlySet<string> = new Set([
  'system.date', 'system.time', 'system.weekday',
  'system.contact_name', 'system.workspace_name', 'system.phone',
  'system.last_reply', 'system.tags', 'system.lead_temperature', 'system.lead_source',
]);

/** Node types that are meant to be the last thing in a flow. */
const TERMINAL: ReadonlySet<string> = new Set(['end', 'assign_agent']);

/** Node types whose whole purpose is to say something. */
const SPEAKS: ReadonlySet<string> = new Set(['message', 'question', 'end', 'assign_agent']);

const HOURS_IN_WINDOW = 24;

export function validateFlow(
  nodes: readonly ValidatableNode[],
  edges: readonly ValidatableEdge[],
): FlowWarning[] {
  const warnings: FlowWarning[] = [];
  if (nodes.length === 0) return warnings;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, string[]>();
  for (const e of edges) {
    const list = out.get(e.source);
    if (list) list.push(e.target); else out.set(e.source, [e.target]);
  }

  // ── 1. Conditions reachable without passing a question ──────────────────────
  // Walked forward from start rather than backward from the condition, because a
  // condition is only safe when EVERY route to it collects an answer first.
  const start = nodes.find((n) => n.type === 'start');
  if (start) {
    const flagged = new Set<string>();
    // State is (node, whether a question has been passed), so a node reachable
    // both ways is examined both ways; that is also what terminates cycles.
    const seen = new Set<string>();
    const queue: Array<{ id: string; sawQuestion: boolean }> = [{ id: start.id, sawQuestion: false }];

    while (queue.length > 0) {
      const { id, sawQuestion } = queue.shift()!;
      const key = `${id}:${sawQuestion}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const node = byId.get(id);
      if (!node) continue;

      if (node.type === 'condition' && !sawQuestion && !flagged.has(id)) {
        flagged.add(id);
        warnings.push({
          nodeId: id,
          kind: 'condition_without_question',
          message: 'This condition has no question before it, so it will check the message that started the flow instead of the customer\'s answer — and take the same branch every time. Put a Question node above it.',
        });
      }

      const next = sawQuestion || node.type === 'question';
      for (const t of out.get(id) ?? []) queue.push({ id: t, sawQuestion: next });
    }
  }

  // ── 2. Placeholders nothing fills ───────────────────────────────────────────
  // Every step that stores an answer, not only Question — a Collect saves one
  // too, and a Webhook can read several out of a response. Missing them here
  // made the validator insist a variable was never saved while the step that
  // saves it sat two lines above.
  const saved = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'question' || n.type === 'collect') {
      const v = text(n, 'saveAsVariable')?.trim();
      if (v) saved.add(v);
    }
    if (n.type === 'webhook') {
      const rows = (n.data as { saveFrom?: Array<{ saveAs?: string }> } | null)?.saveFrom ?? [];
      for (const r of rows) {
        const v = r.saveAs?.trim();
        if (v) saved.add(v);
      }
    }
  }

  for (const n of nodes) {
    const body = text(n, 'message');
    if (!body || !body.includes('{{')) continue;
    const missing = new Set<string>();
    for (const m of body.matchAll(PLACEHOLDER)) {
      const v = m[1]!;
      // Built-ins are seeded by the engine, not by a question. Widening the
      // pattern to admit a dot brought them into view here; the check below
      // handles the misspelt ones.
      if (v.startsWith('system.')) continue;
      if (!saved.has(v)) missing.add(v);
    }
    if (missing.size > 0) {
      const list = [...missing].map((v) => `{{${v}}}`).join(', ');
      warnings.push({
        nodeId: n.id,
        kind: 'unsaved_variable',
        message: `${list} will come out blank — no Question node saves ${missing.size > 1 ? 'these' : 'it'}. Fill in "Save reply as variable" on the question that asks for ${missing.size > 1 ? 'them' : 'it'}.`,
      });
    }
  }

  // ── 3. Placeholders that look like built-ins but are not ────────────────────
  // {{system.contact_name}} is filled in by the engine; {{system.contactname}}
  // is not, and renders empty exactly like any other unknown name.
  for (const n of nodes) {
    const body = text(n, 'message');
    if (!body) continue;
    for (const m of body.matchAll(PLACEHOLDER)) {
      const v = m[1]!;
      if (!v.startsWith('system.') || SYSTEM_VARS.has(v)) continue;
      warnings.push({
        nodeId: n.id,
        kind: 'unknown_system_variable',
        message: `There is no built-in called {{${v}}}, so it will come out blank. The ones that exist are ${[...SYSTEM_VARS].join(', ')}.`,
      });
    }
  }

  // ── 4. Everything measured from the start node ──────────────────────────────
  // One walk answers several questions: what is reachable, where the flow runs
  // out of road, and whether a variable is read before anything has saved it.
  if (start) {
    const reachable = new Set<string>();
    const savedBefore = new Map<string, Set<string>>(); // node -> vars known on arrival
    const queue: Array<{ id: string; known: Set<string> }> = [{ id: start.id, known: new Set() }];

    while (queue.length > 0) {
      const { id, known } = queue.shift()!;
      const prior = savedBefore.get(id);
      // A node reached by several routes knows only what every route saved, so
      // a variable saved on one branch does not count as known on the other.
      if (prior) {
        const merged = new Set([...prior].filter((v) => known.has(v)));
        if (merged.size === prior.size) continue;
        savedBefore.set(id, merged);
      } else {
        savedBefore.set(id, new Set(known));
      }
      reachable.add(id);

      const node = byId.get(id);
      const next = new Set(known);
      if (node?.type === 'question' || node?.type === 'collect') {
        const v = text(node, 'saveAsVariable')?.trim();
        if (v) next.add(v);
      }
      if (node?.type === 'webhook') {
        for (const r of ((node.data as { saveFrom?: Array<{ saveAs?: string }> } | null)?.saveFrom ?? [])) {
          const v = r.saveAs?.trim();
          if (v) next.add(v);
        }
      }
      for (const t of out.get(id) ?? []) queue.push({ id: t, known: next });
    }

    for (const n of nodes) {
      if (reachable.has(n.id)) continue;
      warnings.push({
        nodeId: n.id,
        kind: 'unreachable',
        message: 'Nothing leads here, so this step will never run. Connect it, or delete it.',
      });
    }

    // A variable read before any route to it has saved one. The "never saved"
    // case is already covered above, so only genuinely-ordered mistakes land here.
    for (const n of nodes) {
      if (!reachable.has(n.id)) continue;
      const body = text(n, 'message');
      if (!body || !body.includes('{{')) continue;
      const known = savedBefore.get(n.id) ?? new Set<string>();
      const early = new Set<string>();
      for (const m of body.matchAll(PLACEHOLDER)) {
        const v = m[1]!;
        if (v.startsWith('system.') || !saved.has(v) || known.has(v)) continue;
        early.add(v);
      }
      if (early.size > 0) {
        const list = [...early].map((v) => `{{${v}}}`).join(', ');
        warnings.push({
          nodeId: n.id,
          kind: 'variable_used_too_early',
          message: `${list} is used here but the question that saves ${early.size > 1 ? 'them' : 'it'} comes later, so ${early.size > 1 ? 'they' : 'it'} will be blank. Move the question above this step.`,
        });
      }
    }

    // A long wait pushes the next message past WhatsApp's 24-hour window, where
    // only an approved template may be sent.
    for (const n of nodes) {
      if (n.type !== 'wait' || !reachable.has(n.id)) continue;
      const d = (n.data ?? {}) as Record<string, unknown>;
      const hours =
        (typeof d.days === 'number' ? d.days * 24 : 0) +
        (typeof d.hours === 'number' ? d.hours : 0) +
        (typeof d.minutes === 'number' ? d.minutes / 60 : 0);
      if (hours < HOURS_IN_WINDOW) continue;
      const after = (out.get(n.id) ?? []).map((id) => byId.get(id)).filter(Boolean);
      // A Template step is the supported way to reach someone outside the
      // window, so a wait that leads to one is exactly right.
      if (after.some((x) => x!.type === 'template')) continue;
      if (after.some((x) => SPEAKS.has(x!.type ?? ''))) {
        warnings.push({
          nodeId: n.id,
          kind: 'wait_past_the_window',
          message: `This waits ${Math.round(hours)} hours. WhatsApp only allows a free message within 24 hours of the customer's last one, so whatever is sent after this wait will not arrive.`,
        });
      }
    }
  }

  // ── 5. Steps that cannot do their job ───────────────────────────────────────
  for (const n of nodes) {
    // Only a message and a question are empty-handed without copy. An `end`
    // with nothing written just stops, and a handoff with nothing written
    // routes to a person silently — both are things an author may well mean.
    const mustSpeak = n.type === 'message' || n.type === 'question';
    if (mustSpeak && !text(n, 'message')?.trim()) {
      warnings.push({
        nodeId: n.id,
        kind: 'empty_copy',
        message: n.type === 'question'
          ? 'This asks nothing — the customer will get an empty message and the flow will wait for a reply anyway.'
          : 'There is no message written here, so this step sends nothing.',
      });
    }

    if (n.type === 'template' && !text(n, 'templateName')?.trim()) {
      warnings.push({
        nodeId: n.id,
        kind: 'template_not_chosen',
        message: 'No template is chosen here, so this step sends nothing. Pick one of your approved templates.',
      });
    }

    if (n.type === 'media') {
      const d = (n.data ?? {}) as Record<string, unknown>;
      const missingFile = d.kind === 'location'
        ? typeof d.latitude !== 'number' || typeof d.longitude !== 'number'
        : !text(n, 'url')?.trim();
      if (missingFile) {
        warnings.push({
          nodeId: n.id,
          kind: 'media_without_file',
          message: d.kind === 'location'
            ? 'No place is set, so this step sends nothing.'
            : 'No file link is set, so this step sends nothing.',
        });
      }
    }

    // Running out of connections mid-flow leaves the customer waiting.
    const hasNext = (out.get(n.id) ?? []).length > 0;
    if (!hasNext && n.type !== 'start' && !TERMINAL.has(n.type ?? '')) {
      warnings.push({
        nodeId: n.id,
        kind: 'dead_end',
        message: 'Nothing is connected after this, so the flow stops here without saying goodbye or handing over.',
      });
    }
  }

  return warnings;
}
