import type { NodeHandler, ListSection } from './types';
import type { QuestionNodeData } from '@/modules/flows/types';
import { isSkippableQuestion, questionVarCounts, placeholdersIn } from './pure';

// Asks, then parks the session until the customer replies. The engine saves the
// reply into the node's variable on the way back in, and schedules the node's
// timeoutHours while it waits.
//
// One node, three ways to answer: typing, up to three tap buttons, or a menu of
// up to ten. They are presentations of the same question rather than three node
// types, because the author's decision is "how should they answer this?" — and
// because three near-identical nodes would be three places for a bug to live.
//
// Buttons have worked in the engine since before this file existed, with no
// editor field to set them, so no client had ever used WhatsApp's tap-to-reply.

export interface Choice {
  id: string;
  title: string;
  /** Shown under the title in a list; ignored for buttons. */
  description?: string;
}

export type AnswerMode = 'text' | 'buttons' | 'list';

export interface QuestionExtra {
  answerMode?: AnswerMode;
  choices?: Choice[];
  /** The label on the button that opens a list. WhatsApp requires one. */
  listButtonText?: string;
  header?: string;
  footer?: string;
  /** Pre-choices flows stored plain titles here. Still honoured. */
  buttons?: string[];
}

type QData = QuestionNodeData & QuestionExtra;

const BUTTON_LIMIT = 3;
const LIST_LIMIT = 10;

/** The handle an edge must carry to be the branch for this choice. */
export const choiceHandle = (id: string) => `choice_${id}`;

/**
 * The choices a question offers, whichever way they were authored. Legacy
 * `buttons: string[]` becomes choices whose id is the title, so a flow written
 * before this node had branches keeps working and gains them.
 */
export function resolveChoices(d: QData): Choice[] {
  if (d.choices && d.choices.length > 0) return d.choices;
  if (d.buttons && d.buttons.length > 0) {
    return d.buttons.map((title) => ({ id: title, title }));
  }
  return [];
}

export function answerMode(d: QData): AnswerMode {
  if (d.answerMode) return d.answerMode;
  return resolveChoices(d).length > 0 ? 'buttons' : 'text';
}

/**
 * Which choice the customer picked. A tap gives an exact id or title; typing is
 * matched case-insensitively against the titles, and a number picks by position
 * so "2" works when someone replies to a menu by counting. Returns null when
 * the reply is not one of the choices at all.
 */
export function matchChoice(
  choices: Choice[],
  reply: string,
  tapped?: { id?: string; title?: string },
): Choice | null {
  if (tapped?.id) {
    const byId = choices.find((c) => c.id === tapped.id);
    if (byId) return byId;
  }
  const text = (tapped?.title ?? reply ?? '').trim().toLowerCase();
  if (!text) return null;

  const byTitle = choices.find((c) => c.title.trim().toLowerCase() === text);
  if (byTitle) return byTitle;

  if (/^\d{1,2}$/.test(text)) {
    const idx = parseInt(text, 10) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx]!;
  }
  return null;
}

export const questionHandler: NodeHandler = {
  type: 'question',

  // 'other' is where a typed answer goes when the question offered choices and
  // the customer typed something else. 'timeout' is where silence goes.
  handles(data) {
    const d = data as QData;
    return [...resolveChoices(d).map((c) => choiceHandle(c.id)), 'other', 'timeout'];
  },

  async run(ctx) {
    // Skip-ahead: a reply earlier in the flow may already have volunteered this
    // answer. Guarded in isSkippableQuestion — unique variable, present, not
    // forceAsk — so a flow that reuses one variable across questions still asks.
    if (isSkippableQuestion(ctx.node, questionVarCounts(ctx.flow.nodes), ctx.vars)) {
      return { outcome: { next: 'edge' } };
    }

    const d = ctx.node.data as QData;
    if (!d.message) return { outcome: { next: 'wait' } };

    const body = ctx.interpolate(d.message);
    const choices = resolveChoices(d);
    const mode = answerMode(d);

    if (mode === 'list' && choices.length > 0) {
      const sections: ListSection[] = [{
        rows: choices.slice(0, LIST_LIMIT).map((c) => ({
          id: c.id,
          title: c.title.slice(0, 24),
          description: c.description?.slice(0, 72),
        })),
      }];
      await ctx.send.list(body, d.listButtonText || 'Choose', sections, d.header, d.footer);
    } else if (mode === 'buttons' && choices.length > 0) {
      await ctx.send.buttons(
        body,
        choices.slice(0, BUTTON_LIMIT).map((c) => c.title),
        d.header,
        d.footer,
      );
    } else {
      await ctx.send.text(body);
    }

    return { outcome: { next: 'wait' } };
  },

  async resume(ctx) {
    const d = ctx.node.data as QData;
    const choices = resolveChoices(d);
    // A free-text question has one way forward, which is what it always had.
    if (choices.length === 0) return { outcome: { next: 'edge' } };

    const picked = matchChoice(choices, ctx.incoming, ctx.choice);
    return {
      outcome: { next: 'edge', handle: picked ? choiceHandle(picked.id) : 'other' },
    };
  },

  describe(data) {
    const d = data as QData;
    return {
      readsVars: placeholdersIn(d.message),
      writesVars: d.saveAsVariable ? [d.saveAsVariable] : [],
    };
  },
};
