// lib/flow-nodes/types.ts
//
// The contract every flow node implements.
//
// It replaces a switch in which each of six cases repeated the same four steps —
// do the thing, find the next node, advance the session, recurse — and in which
// a node type that forgot one of them failed quietly. The engine now owns all
// four; a handler says only what it did and where control goes.
//
// Everything a handler touches arrives through this context, so a handler test
// needs no database and no network: pass a fake `send` and `ops`, assert the
// result and the calls.

import type { FlowNode, FlowEdge } from '@/modules/flows/types';

// Numeric values feed condition nodes; the `_text` suffix holds the raw reply.
// The shape is load-bearing for eighteen live flows and every open session, so
// it stays as it is. New built-ins live under the `system.` prefix instead.
export type FlowContext = Record<string, number | string>;

export type MediaKind = 'image' | 'video' | 'document' | 'audio';

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}
export interface ListSection {
  title?: string;
  rows: ListRow[];
}

// Sending and recording an outbound message are never done apart, so they are
// one call. A handler cannot send without the conversation showing it.
export interface SendFacade {
  text(body: string): Promise<void>;
  buttons(body: string, buttons: string[], header?: string, footer?: string): Promise<void>;
  media(kind: MediaKind, url: string, caption?: string, filename?: string): Promise<void>;
  location(latitude: number, longitude: number, name?: string, address?: string): Promise<void>;
  list(body: string, buttonText: string, sections: ListSection[], header?: string, footer?: string): Promise<void>;
  /**
   * An approved WhatsApp template. The only message that may be sent more than
   * 24 hours after the customer's last one — everything else above is refused
   * by WhatsApp outside that window, which is what makes a long Wait useless
   * without this.
   *
   * `bodyParams` fill {{1}}, {{2}} … in the template's body, in order.
   */
  template(name: string, language: string, bodyParams: string[]): Promise<void>;
}

// Everything a node does that is not a message. Each operation is scoped to the
// running workspace by the implementation, never by the caller.
export interface FlowOps {
  setConversationStatus(status: 'open' | 'pending' | 'resolved' | 'closed'): Promise<void>;
  addTags(tags: string[]): Promise<void>;
  removeTags(tags: string[]): Promise<void>;
  setLeadTemperature(temperature: 'hot' | 'warm' | 'cold'): Promise<void>;
  setContactField(field: string, value: string): Promise<void>;
  assignTo(memberId: string): Promise<void>;
  createTask(title: string, dueInHours?: number, assigneeId?: string): Promise<void>;
  notifyTeam(message: string, channel: 'whatsapp' | 'email'): Promise<void>;
  optOut(): Promise<void>;
  // Parks a wake-up for this session. `handle` is the edge to follow when it
  // fires; nothing fires if the session has moved on by then.
  schedule(atIso: string, handle: string): Promise<void>;
  cancelSchedules(): Promise<void>;
}

/**
 * The bot's own voice, available to a step that wants to answer rather than
 * recite. Behind a facade like `send` and `ops`, so a handler stays free of
 * server-only imports and the editor's simulator can run it unchanged.
 */
export interface AiFacade {
  /**
   * Answers `incoming` using this workspace's persona and knowledge base.
   * `instruction` narrows it — "only about pricing", "keep it to one line".
   * Returns null when the model could not be reached, and the caller decides
   * what to do rather than this throwing mid-conversation.
   */
  reply(incoming: string, instruction?: string): Promise<string | null>;
}

export interface NodeRunContext {
  node: FlowNode;
  /**
   * The whole flow. A question needs it to tell whether a later question has
   * already been answered, and a jump needs it to name a node. Handlers read
   * it; only the engine moves through it.
   */
  flow: { nodes: FlowNode[]; edges: FlowEdge[] };
  /** The customer message that brought control here. Empty when a timer did. */
  incoming: string;
  /**
   * The structured reply, when the customer tapped a button or picked from a
   * list rather than typing. The webhook stores the message text as
   * `[Tapped button: "Book Now"]`, which is fine to display and useless to match
   * on, so the id and title travel separately.
   */
  choice?: { id?: string; title?: string };
  /** Read-only view of the session context. Handlers add via `setVars`. */
  vars: Readonly<FlowContext>;
  send: SendFacade;
  ops: FlowOps;
  ai: AiFacade;
  workspaceId: string;
  conversationId: string;
  sessionId: string;
  contactId: string | null;
  contactPhone: string;
  /** Resolves {{placeholders}} against the context, including `system.` keys. */
  interpolate(text: string): string;
}

export type NodeOutcome =
  /** Follow an outgoing edge. `handle` picks which, when the node has several. */
  | { next: 'edge'; handle?: string }
  /** Park the session on this node and wait for the customer. */
  | { next: 'wait' }
  /**
   * Park the session until a timer resumes it. Unlike `wait`, a message that
   * arrives meanwhile does not advance the flow — the bot answers it normally
   * and the flow wakes on its own schedule. This is what lets a follow-up sit
   * two days out without silencing the customer in between.
   */
  | { next: 'sleep' }
  /** Continue at a named node, bypassing edges. */
  | { next: 'goto'; nodeId: string }
  /** Finish the session. */
  | { next: 'end' }
  /** Park the conversation for a human and finish the session. */
  | { next: 'handoff' };

export interface NodeResult {
  outcome: NodeOutcome;
  /** Merged into the session context before control moves on. */
  setVars?: FlowContext;
}

export interface NodeHandler {
  type: string;
  /**
   * The outgoing edge handles this node can take. It is a function of the node's
   * data because a question's branches are its choices, which the author sets.
   * The validator warns when a node has more outgoing edges than it can ever
   * follow — which is how a second edge used to be ignored in silence.
   */
  handles?(data: unknown): string[];
  run(ctx: NodeRunContext): Promise<NodeResult>;
  /**
   * Called instead of `run` when a customer replies while the session is parked
   * on this node. It decides where the reply sends control — which is how a
   * tapped button takes its own branch. Omitting it means "follow the single
   * outgoing edge", the behaviour every parked node had before.
   *
   * The engine saves the reply into the node's `saveAsVariable` before calling
   * this, so a handler never has to.
   */
  resume?(ctx: NodeRunContext): Promise<NodeResult>;
  /**
   * Pure. What the node reads and writes, for the validator and the simulator.
   */
  describe?(data: unknown): { readsVars?: string[]; writesVars?: string[] };
}
