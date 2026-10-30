// lib/flow-validate-db.ts
//
// The two checks the pure validator cannot make, because the answer is not in
// the flow being edited: whether another active flow reaches the customer
// first, and whether the templates this flow sends still exist.
//
// They run at save time in the API route, which is the only place holding the
// workspace's other flows and its template list. The functions themselves take
// that data as plain arguments, so they are tested without a database.
//
// Same `FlowWarning` type as the pure checks, and anchored to the start node for
// the trigger ones — the trigger IS the start node's data, so the author sees
// the warning on the step it is about, in the list they already read.

import type { FlowWarning, ValidatableNode } from './flow-validate';
import { triggerOrder } from './flow-triggers';

/** What the route reads for every other flow in the workspace. */
export interface SiblingFlow {
  id: string;
  name: string;
  isActive: boolean;
  triggerType: string | null;
  triggerValue: string | null;
  /** Absent on older rows; the engine reads a missing priority as 0. */
  priority?: number | null;
  createdAt: string | null;
}

/** What the route reads for every template in the workspace. */
export interface WorkspaceTemplate {
  name: string;
  language: string | null;
  status: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

/**
 * The order the engine resolves triggers in. Imported from flow-triggers rather
 * than restated here — it was a copy until migration 142, and a warning that
 * disagreed with the engine about which flow wins would name the wrong one.
 *
 * `priority` is real as of migration 142. Until then the engine sorted on a
 * column that did not exist, so every flow scored 0 and an author had no way to
 * change the order; the warnings below could not offer it as a remedy.
 */
function engineOrder(flows: SiblingFlow[]): SiblingFlow[] {
  return triggerOrder(flows.map((f) => ({ ...f, name: f.name })));
}

/**
 * True when `first` always reaches the customer before `second` can, so
 * `second` can never run.
 *
 * Different trigger types never shadow each other: they answer different
 * questions about the same message, and a flow on a keyword still fires on
 * every message after the one a `first_message` flow claimed. Claiming
 * otherwise would be a false warning, which is worse than none.
 *
 * Within a type:
 *
 *  * **keyword** — matching is `content.includes(keyword)`, not equality, so a
 *    message carrying the longer keyword carries the shorter one too. "Book"
 *    swallows "Book Now" and nothing a customer can type reaches the second
 *    flow. This is the trap worth catching: two identical triggers are obvious,
 *    one keyword hiding inside another is not.
 *  * **button, ad_click, campaign_reply** — an empty value means "any", so an
 *    unset one swallows every specific one; two with the same value are a plain
 *    duplicate. Equality, not substring: these are ids, and an id that happens
 *    to contain another is a coincidence, not a match.
 *  * **first_message, any_message** — neither takes a value, so a second one
 *    can never fire.
 *  * **manual** — a message never starts it, so it conflicts with nothing.
 */
function alwaysWins(first: SiblingFlow, second: SiblingFlow): boolean {
  if (first.triggerType !== second.triggerType) return false;

  switch (first.triggerType) {
    case 'first_message':
    case 'any_message':
      return true;

    case 'keyword': {
      const a = norm(first.triggerValue);
      const b = norm(second.triggerValue);
      // The engine requires a truthy keyword, so an empty one matches nothing
      // and can neither hide a flow nor be hidden by one.
      if (!a || !b) return false;
      return b.includes(a);
    }

    case 'button':
    case 'ad_click':
    case 'campaign_reply': {
      const a = norm(first.triggerValue);
      const b = norm(second.triggerValue);
      return a.length === 0 || a === b;
    }

    // 'manual', and any type a newer deploy knows and this one does not.
    default:
      return false;
  }
}

function describeTrigger(flow: SiblingFlow): string {
  switch (flow.triggerType) {
    case 'first_message': return 'the first message from a contact';
    case 'any_message':   return 'any message';
    case 'button':        return flow.triggerValue ? `the button "${flow.triggerValue}"` : 'any button tap';
    case 'ad_click':      return flow.triggerValue ? `ad ${flow.triggerValue}` : 'any Meta ad click';
    case 'campaign_reply': return flow.triggerValue ? 'that campaign’s replies' : 'any campaign reply';
    default:              return `"${flow.triggerValue ?? ''}"`;
  }
}

/**
 * Trigger conflicts between the flow being saved and the workspace's others.
 *
 * Reports both directions, because both are the author's problem and only one
 * is visible from the flow they are looking at: this flow never firing, and
 * this flow stopping another from ever firing.
 *
 * An inactive flow conflicts with nothing — saving a draft must not warn, and
 * the engine only ever looks at active flows.
 */
export function triggerConflictWarnings(
  self: SiblingFlow,
  others: SiblingFlow[],
  startNodeId: string,
): FlowWarning[] {
  if (!self.isActive) return [];

  const active = others.filter((f) => f.isActive && f.id !== self.id);
  const warnings: FlowWarning[] = [];

  const ordered = engineOrder([self, ...active]);
  const selfIndex = ordered.findIndex((f) => f.id === self.id);

  // Only a flow the engine reaches BEFORE this one can hide it.
  const blocker = ordered.slice(0, selfIndex).find((earlier) => alwaysWins(earlier, self));

  if (blocker) {
    warnings.push({
      nodeId: startNodeId,
      kind: 'trigger_never_fires',
      message:
        `This flow will never run: "${blocker.name}" is active, matches ${describeTrigger(blocker)}, ` +
        `and is reached first. Give this flow a different trigger, raise its priority above ` +
        `"${blocker.name}", or turn that one off.`,
    });
  }

  for (const victim of ordered.slice(selfIndex + 1)) {
    if (alwaysWins(self, victim)) {
      warnings.push({
        nodeId: startNodeId,
        kind: 'trigger_shadows_another',
        message:
          `"${victim.name}" will never run while this flow is active: this one matches ` +
          `${describeTrigger(self)} and is reached first.`,
      });
    }
  }

  return warnings;
}

/**
 * Template nodes pointing at a template the workspace can no longer send.
 *
 * A template's text lives with Meta and can be deleted or rejected there long
 * after a flow was built. The flow keeps the name, the send fails, and the
 * customer gets nothing — which is the worst possible place for this to
 * surface, because a template step is the one that runs days later, outside the
 * 24-hour window, when nobody is watching.
 *
 * A node with no template chosen is left alone: the pure validator already says
 * `template_not_chosen`, and saying it twice teaches people to skim.
 */
export function templateReferenceWarnings(
  nodes: ValidatableNode[],
  templates: WorkspaceTemplate[],
): FlowWarning[] {
  const warnings: FlowWarning[] = [];

  for (const node of nodes) {
    if (node.type !== 'template') continue;
    const data = (node.data ?? {}) as { templateName?: unknown; language?: unknown };
    const name = typeof data.templateName === 'string' ? data.templateName.trim() : '';
    if (!name) continue;

    const language =
      typeof data.language === 'string' && data.language.trim() ? data.language.trim() : 'en';

    const byName = templates.filter((t) => t.name === name);
    if (byName.length === 0) {
      warnings.push({
        nodeId: node.id,
        kind: 'template_missing',
        message: `Template "${name}" no longer exists in this workspace. This step will send nothing.`,
      });
      continue;
    }

    const inLanguage = byName.filter((t) => (t.language ?? 'en') === language);
    if (inLanguage.length === 0) {
      warnings.push({
        nodeId: node.id,
        kind: 'template_missing',
        message:
          `Template "${name}" exists but not in ${language}. A template is approved per language; ` +
          `this workspace has it in: ${byName.map((t) => t.language ?? 'en').join(', ')}.`,
      });
      continue;
    }

    if (!inLanguage.some((t) => t.status === 'approved')) {
      warnings.push({
        nodeId: node.id,
        kind: 'template_not_approved',
        message:
          `Template "${name}" (${language}) is ${inLanguage[0]!.status ?? 'not approved'}. ` +
          `WhatsApp refuses an unapproved template, so this step will send nothing.`,
      });
    }
  }

  return warnings;
}
