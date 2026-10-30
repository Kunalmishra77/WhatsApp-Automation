// lib/flow-nodes/index.ts
//
// The node registry. Adding a node type to the platform is this file plus one
// handler file plus one editor panel — which is the property that makes the
// palette something we can keep growing rather than a one-time push.

import type { NodeHandler } from './types';
import { startHandler } from './start';
import { messageHandler } from './message';
import { questionHandler } from './question';
import { conditionHandler } from './condition';
import { assignAgentHandler } from './assign-agent';
import { endHandler } from './end';
import { waitHandler } from './wait';
import { mediaHandler } from './media';
import { actionHandler } from './action';
import { templateHandler } from './template';

const HANDLERS: NodeHandler[] = [
  // The six that existed before the registry. Their behaviour is unchanged.
  startHandler,
  messageHandler,
  questionHandler,
  conditionHandler,
  assignAgentHandler,
  endHandler,
  // Added with the registry.
  waitHandler,
  mediaHandler,
  actionHandler,
  templateHandler,
];

export const NODE_HANDLERS: Record<string, NodeHandler> = Object.fromEntries(
  HANDLERS.map((h) => [h.type, h]),
);

/**
 * The handler for a node type, or null for a type this build does not know.
 * A flow saved by a newer deploy can name a node this one cannot run; the engine
 * ends that session rather than guessing, which is what the old switch's
 * `default` case did.
 */
export function handlerFor(type: string | undefined | null): NodeHandler | null {
  if (!type) return null;
  return NODE_HANDLERS[type] ?? null;
}

/** The edge handles a specific node can follow. */
export function handlesForNode(type: string | undefined | null, data: unknown): string[] {
  return handlerFor(type)?.handles?.(data) ?? [];
}

export type { NodeHandler };
export * from './types';
