// lib/flow-save-warnings.ts
//
// Gathers what the save-time checks need and runs them. The checks themselves
// are pure and live in flow-validate-db.ts; this is the only part that touches
// the database, which is why it is a separate file — the checks stay testable
// without one.
//
// Warnings, never errors. A half-built flow is a normal thing to save, and the
// author is the one who decides whether a conflict matters. The save goes
// through and the response carries the list.

import {
  triggerConflictWarnings,
  templateReferenceWarnings,
  type SiblingFlow,
  type WorkspaceTemplate,
} from './flow-validate-db';
import type { FlowWarning, ValidatableNode } from './flow-validate';

interface FlowRow {
  id: string;
  name?: string | null;
  is_active?: boolean | null;
  trigger_type?: string | null;
  trigger_value?: string | null;
  priority?: number | null;
  created_at?: string | null;
}

function toSibling(row: FlowRow): SiblingFlow {
  return {
    id: row.id,
    name: row.name ?? 'Untitled flow',
    isActive: row.is_active === true,
    triggerType: row.trigger_type ?? null,
    triggerValue: row.trigger_value ?? null,
    priority: row.priority ?? 0,
    createdAt: row.created_at ?? null,
  };
}

/**
 * Save-time warnings for the flow row as it now stands in the database.
 *
 * Called after the write, with the saved row — not with the request body. A
 * check run on the body would be answering a question about a flow that does
 * not exist yet, and `is_active` and the trigger are exactly the fields a PATCH
 * may leave untouched.
 *
 * Never throws. These are advice; a failure to gather them must not turn a
 * successful save into an error the author cannot act on.
 */
export async function flowSaveWarnings(
  supabase: { from: (table: string) => any },
  workspaceId: string,
  saved: FlowRow & { nodes?: unknown },
): Promise<FlowWarning[]> {
  try {
    const nodes = Array.isArray(saved.nodes) ? (saved.nodes as ValidatableNode[]) : [];
    const startNodeId = nodes.find((n) => n.type === 'start')?.id;

    // Only fetch the template list when something actually sends one. Most
    // flows have no template step, and most saves are a node being dragged.
    const needsTemplates = nodes.some((n) => n.type === 'template');

    const [flowsRes, templatesRes] = await Promise.all([
      supabase
        .from('chatbot_flows')
        .select('id, name, is_active, trigger_type, trigger_value, priority, created_at')
        .eq('workspace_id', workspaceId),
      needsTemplates
        ? supabase.from('templates').select('name, language, status').eq('workspace_id', workspaceId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Fail-open but never silent: a save that quietly stopped checking is a
    // warning the author will not know they are missing.
    if (flowsRes?.error) {
      console.error('[FlowSaveWarnings] flow list failed:', flowsRes.error.message);
      return [];
    }
    if (templatesRes?.error) {
      console.error('[FlowSaveWarnings] template list failed:', templatesRes.error.message);
    }

    const siblings = ((flowsRes?.data ?? []) as FlowRow[]).map(toSibling);
    const self = siblings.find((f) => f.id === saved.id) ?? toSibling(saved);

    const warnings: FlowWarning[] = [];

    // A flow with no start node cannot be triggered at all, and the pure
    // validator says so; there is no step to hang a trigger warning on.
    if (startNodeId) {
      warnings.push(...triggerConflictWarnings(self, siblings, startNodeId));
    }

    warnings.push(
      ...templateReferenceWarnings(nodes, (templatesRes?.data ?? []) as WorkspaceTemplate[]),
    );

    return warnings;
  } catch (error) {
    console.error('[FlowSaveWarnings] unexpected failure:', error);
    return [];
  }
}
