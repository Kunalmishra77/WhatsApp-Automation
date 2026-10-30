// lib/flow-versions.ts
//
// What changed between two saved versions of a flow, in one line.
//
// A history that only shows timestamps makes the client scroll through it one
// restore at a time to find the save they want back. "Removed 2 steps" is the
// difference between a list and a usable one.
//
// Deliberately coarse. A real diff of node data would be more precise and far
// less readable: an author looking for "the save before I deleted the pricing
// branch" needs the shape of the change, not which field moved.

interface Snapshot {
  nodes: unknown;
  edges: unknown;
  name: string | null;
}

function ids(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  const out = new Set<string>();
  for (const item of value) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && id.length > 0) out.add(id);
  }
  return out;
}

/** Steps whose own data changed between the two versions, ignoring position. */
function editedSteps(before: unknown, after: unknown): number {
  if (!Array.isArray(before) || !Array.isArray(after)) return 0;
  const beforeById = new Map<string, string>();
  for (const n of before) {
    const node = n as { id?: unknown; data?: unknown; type?: unknown };
    if (typeof node.id === 'string') {
      // Position is left out on purpose: dragging a node around the canvas is
      // not an edit anyone wants listed in their history.
      beforeById.set(node.id, JSON.stringify({ t: node.type, d: node.data }));
    }
  }
  let count = 0;
  for (const n of after) {
    const node = n as { id?: unknown; data?: unknown; type?: unknown };
    if (typeof node.id !== 'string') continue;
    const prior = beforeById.get(node.id);
    if (prior === undefined) continue; // added, counted separately
    if (prior !== JSON.stringify({ t: node.type, d: node.data })) count += 1;
  }
  return count;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * One line describing this version against the one before it.
 *
 * `previous` is null for the oldest version in the list, which is where the
 * history runs out rather than where the flow began — the trigger keeps 50
 * versions, and the seed row is "the flow as it already was".
 */
export function describeVersionChange(
  version: Snapshot,
  previous: Snapshot | null,
): string {
  if (!previous) return 'Earliest version kept';

  const parts: string[] = [];

  const nodesBefore = ids(previous.nodes);
  const nodesAfter = ids(version.nodes);
  const added = [...nodesAfter].filter((id) => !nodesBefore.has(id)).length;
  const removed = [...nodesBefore].filter((id) => !nodesAfter.has(id)).length;

  if (added > 0) parts.push(`added ${plural(added, 'step', 'steps')}`);
  if (removed > 0) parts.push(`removed ${plural(removed, 'step', 'steps')}`);

  const edited = editedSteps(previous.nodes, version.nodes);
  if (edited > 0) parts.push(`changed ${plural(edited, 'step', 'steps')}`);

  const edgesBefore = ids(previous.edges);
  const edgesAfter = ids(version.edges);
  const connAdded = [...edgesAfter].filter((id) => !edgesBefore.has(id)).length;
  const connRemoved = [...edgesBefore].filter((id) => !edgesAfter.has(id)).length;
  // Rewiring shows as both, so it is reported as one thing rather than two.
  if (connAdded > 0 && connRemoved > 0) {
    parts.push('rewired connections');
  } else if (connAdded > 0) {
    parts.push(`connected ${plural(connAdded, 'step', 'steps')}`);
  } else if (connRemoved > 0) {
    parts.push(`disconnected ${plural(connRemoved, 'step', 'steps')}`);
  }

  if ((version.name ?? '') !== (previous.name ?? '')) parts.push('renamed the flow');

  // A save that changed only node positions reaches here. Saying so is better
  // than an empty line that reads like a bug.
  if (parts.length === 0) return 'Moved steps on the canvas';

  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}
