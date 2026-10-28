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
  kind: 'condition_without_question' | 'unsaved_variable';
  message: string;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

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
  const saved = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'question') {
      const v = text(n, 'saveAsVariable')?.trim();
      if (v) saved.add(v);
    }
  }

  for (const n of nodes) {
    const body = text(n, 'message');
    if (!body || !body.includes('{{')) continue;
    const missing = new Set<string>();
    for (const m of body.matchAll(PLACEHOLDER)) {
      const v = m[1]!;
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

  return warnings;
}
