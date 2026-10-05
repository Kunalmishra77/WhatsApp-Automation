// AI lead-pipeline classifier — reads a conversation's recent messages, asks the
// AI to classify the lead's stage/intent, and (if confident) advances the lead's
// pipeline stage, flags follow-ups, and detects conversions.
//
// Fail-closed by design: any AI error, JSON parse failure, or out-of-enum stage
// causes parseClassification() to return null, and classifyLeadPipeline() no-ops
// (no lead is modified). applyLeadClassification() is a PURE function — it takes
// the current lead + the parsed classification + `now` and returns the writes to
// make; it never touches the network or the database, so it's fully unit-testable.

import { callAI } from '@/lib/ai-client';
import { createAdminClient } from '@/services/supabase/admin';

export type LeadStage = 'new' | 'contacted' | 'follow_up' | 'interested' | 'converted' | 'lost';
export type LeadTemperature = 'hot' | 'warm' | 'cold';

export const VALID_STAGES: LeadStage[] = ['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost'];

// Below this confidence, we record the AI's read (metadata) but do NOT move the
// pipeline stage — better a stale-but-correct stage than a confidently-wrong jump.
export const STAGE_CONFIDENCE_THRESHOLD = 70;

// Temperature is DERIVED from the 0-100 score. Thresholds are the per-client-
// configurable defaults (Phase 2 will read them from workspace settings).
export interface TemperatureThresholds { hot: number; warm: number }
export const DEFAULT_THRESHOLDS: TemperatureThresholds = { hot: 61, warm: 31 };

export function scoreToTemperature(score: number, t: TemperatureThresholds = DEFAULT_THRESHOLDS): LeadTemperature {
  if (score >= t.hot) return 'hot';
  if (score >= t.warm) return 'warm';
  return 'cold';
}

// Temperature only moves when the AI is at least moderately sure — avoids flip-flop
// on an uncertain read (user requirement: low confidence must not aggressively reclassify).
export const TEMPERATURE_CONFIDENCE_THRESHOLD = 50;

// Fallback score per stage when the model omits a numeric score (older/loose replies),
// so we never collapse everything to 0 (= all Cold).
const STAGE_DEFAULT_SCORE: Record<LeadStage, number> = {
  new: 10, contacted: 30, follow_up: 35, interested: 70, converted: 95, lost: 5,
};

// Default follow-up window when the AI flags "needs follow-up" but no explicit
// due date exists (or the existing one has already passed).
export const FOLLOW_UP_DEFAULT_HOURS = 24;

export type LeadClassification = {
  stage: LeadStage;
  confidence: number;
  reason: string;
  score: number;          // 0-100 genuine-intent score
  signals: string[];      // short reasons that drove the score (explainability)
  needs_follow_up: boolean;
  follow_up_reason: string | null;
  converted: boolean;
  conversion_quote: string | null;
};

export type LeadRow = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  stage: LeadStage;
  follow_up_at: string | null;
  temperature?: LeadTemperature | null;
};

export type LeadWrites = {
  leadUpdate: Record<string, unknown>;
  historyRow: { from_stage: LeadStage; to_stage: LeadStage; source: 'ai'; reason: string; confidence: number } | null;
  // Temperature-band transition to log for the audit trail (null if unchanged).
  scoreHistoryRow: { from_temperature: LeadTemperature | null; to_temperature: LeadTemperature; score: number; confidence: number; reason: string } | null;
  promoteContact: boolean;
};

function isValidStage(v: unknown): v is LeadStage {
  return typeof v === 'string' && (VALID_STAGES as string[]).includes(v);
}

function clampConfidence(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, n));
}

function toNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

// Strict JSON parse + validation of the AI's raw reply text. Strips a ```json
// fenced block if present (models sometimes wrap JSON in markdown fences despite
// jsonMode). Returns null on ANY malformed input — never throws.
export function parseClassification(raw: string): LeadClassification | null {
  try {
    let text = raw.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenced) text = fenced[1] ?? '';

    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;

    if (!isValidStage(obj.stage)) return null;

    const score = typeof obj.score === 'number' && Number.isFinite(obj.score)
      ? Math.max(0, Math.min(100, Math.round(obj.score)))
      : STAGE_DEFAULT_SCORE[obj.stage];
    const signals = Array.isArray(obj.signals)
      ? (obj.signals as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 8)
      : [];

    return {
      stage: obj.stage,
      confidence: clampConfidence(obj.confidence),
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      score,
      signals,
      needs_follow_up: obj.needs_follow_up === true,
      follow_up_reason: toNullableString(obj.follow_up_reason),
      converted: obj.converted === true,
      conversion_quote: toNullableString(obj.conversion_quote),
    };
  } catch {
    return null;
  }
}

// PURE — no I/O. Computes the exact writes to persist for this classification.
// `now` is injected so callers/tests control time deterministically.
export function applyLeadClassification(
  lead: LeadRow,
  c: LeadClassification,
  now: Date,
  thresholds: TemperatureThresholds = DEFAULT_THRESHOLDS,
): LeadWrites {
  const leadUpdate: Record<string, unknown> = {
    ai_stage_confidence: c.confidence,
    stage_reason: c.reason,
    ai_classified_at: now.toISOString(),
    // Unified score (source of truth) + explainability — always recorded.
    // `ai_score` is the existing displayed column (LeadDetail/LeadCard/export); the
    // AI classifier is now its single writer, replacing the old heuristic scorer.
    ai_score: c.score,
    score_confidence: c.confidence,
    score_signals: c.signals,
  };
  let historyRow: LeadWrites['historyRow'] = null;
  let scoreHistoryRow: LeadWrites['scoreHistoryRow'] = null;
  let promoteContact = false;
  let converted = false;

  if (c.converted && lead.stage !== 'converted') {
    converted = true;
    leadUpdate.stage = 'converted';
    leadUpdate.stage_source = 'ai';
    leadUpdate.closed_at = now.toISOString();
    leadUpdate.converted_signal = c.conversion_quote;
    leadUpdate.conversion_reviewed = false;
    historyRow = {
      from_stage: lead.stage,
      to_stage: 'converted',
      source: 'ai',
      reason: c.reason,
      confidence: c.confidence,
    };
    promoteContact = lead.contact_id != null;
  } else if (c.confidence >= STAGE_CONFIDENCE_THRESHOLD && c.stage !== lead.stage) {
    leadUpdate.stage = c.stage;
    leadUpdate.stage_source = 'ai';
    historyRow = {
      from_stage: lead.stage,
      to_stage: c.stage,
      source: 'ai',
      reason: c.reason,
      confidence: c.confidence,
    };
  }

  // Temperature is DERIVED from the score. Only move it when the AI is at least
  // moderately confident (no aggressive flip on an uncertain read). Converted leads
  // are terminal and excluded from hot/warm/cold, so we don't touch temperature then.
  if (!converted && c.confidence >= TEMPERATURE_CONFIDENCE_THRESHOLD) {
    const newTemp = scoreToTemperature(c.score, thresholds);
    if (newTemp !== (lead.temperature ?? null)) {
      leadUpdate.temperature = newTemp;
      scoreHistoryRow = {
        from_temperature: lead.temperature ?? null,
        to_temperature: newTemp,
        score: c.score,
        confidence: c.confidence,
        reason: c.reason,
      };
    }
  }

  // A won lead needs no follow-up — skip entirely when converted (converted
  // leads never get a needs_follow_up write at all). A lost lead also needs no
  // follow-up, but unlike converted it's still cleared explicitly (not skipped)
  // since a lead can already be 'lost' coming into this call.
  if (!converted) {
    if (c.needs_follow_up && lead.stage !== 'lost') {
      leadUpdate.needs_follow_up = true;
      leadUpdate.follow_up_reason = c.follow_up_reason;
      const existing = lead.follow_up_at ? new Date(lead.follow_up_at) : null;
      if (!existing || existing.getTime() <= now.getTime()) {
        leadUpdate.follow_up_at = new Date(now.getTime() + FOLLOW_UP_DEFAULT_HOURS * 60 * 60 * 1000).toISOString();
      }
    } else {
      leadUpdate.needs_follow_up = false;
    }
  }

  return { leadUpdate, historyRow, scoreHistoryRow, promoteContact };
}

const STAGE_DEFINITIONS = `- new: the lead just arrived, no reply from us yet.
- contacted: we replied, but no clear interest signal from the customer yet.
- follow_up: we're waiting on the customer, or they went quiet after engaging.
- interested: explicit buying signals — asking about price, timeline, or booking.
- converted: a confirmed purchase, booking, or payment happened in the chat.
- lost: the customer explicitly declined, is unreachable, or said not interested.`;

const SYSTEM_PROMPT = `You are a sales pipeline classifier for a WhatsApp business chat. Read the conversation transcript and classify the lead's current stage.

Valid stages:
${STAGE_DEFINITIONS}

Return ONLY strict JSON (no markdown, no commentary) with exactly these keys:
{
  "stage": one of "new"|"contacted"|"follow_up"|"interested"|"converted"|"lost",
  "confidence": integer 0-100,
  "score": integer 0-100,
  "signals": array of short strings (the specific reasons that drove the score),
  "reason": string, <= 140 characters, specific and short,
  "needs_follow_up": boolean,
  "follow_up_reason": string or null,
  "converted": boolean,
  "conversion_quote": string or null
}

SCORING RULES — "score" (0-100) = genuine buying intent + engagement, NOT message count:
- A single generic/greeting/informational message with NO concrete buying signal MUST score <= 25. Sending one message NEVER makes a hot lead.
- Raise ABOVE 60 only when there are clear buying signals, e.g.: asking price/quote, requesting a demo/appointment, asking availability, discussing payment/order details, negotiating, or sharing a concrete requirement (qty/size/date/budget) — AND the customer is actively engaged.
- Score 80-100 for strong, explicit purchase intent or payment/order discussion.
- Lower the score when the customer says "later/maybe/not now/baad mein", goes quiet, or only asks general info with no intent.
- "signals" must list the exact evidence (e.g. "asked price", "requested demo", "shared requirement", "went quiet after interest", "only a greeting").

- Set "converted": true ONLY when there is an explicit in-chat confirmation of a purchase, booking, or payment. Quote the customer's exact line in "conversion_quote".
- Set "needs_follow_up": true when the customer is waiting on us, or went quiet after showing interest. Explain briefly in "follow_up_reason".
- "confidence" reflects how sure you are of the overall read. Use a lower confidence when the conversation is short or ambiguous.
- Keep "reason" specific to what happened in THIS conversation, not generic.`;

type ConversationMessage = { direction: 'inbound' | 'outbound'; content: string | null };

function buildTranscript(messages: ConversationMessage[]): string {
  return messages
    .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.content ?? ''}`)
    .join('\n');
}

// Orchestrates the full classification pipeline: load messages → build prompt →
// callAI → parseClassification → applyLeadClassification → persist. Swallows and
// logs all errors — never throws, so a bad conversation never breaks a caller
// (webhook, cron, etc.) that triggers classification as a side effect.
export async function classifyLeadPipeline(args: {
  conversationId: string;
  workspaceId: string;
  leadId: string;
}): Promise<void> {
  const { conversationId, workspaceId, leadId } = args;
  try {
    const supabase = createAdminClient();
    const db = supabase as any;

    const { data: lead } = await db
      .from('leads')
      .select('id, workspace_id, contact_id, stage, follow_up_at, temperature')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .single();
    if (!lead) return;

    const { data: messages } = await db
      .from('messages')
      .select('direction, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(15);
    const ordered: ConversationMessage[] = (messages ?? [])
      .slice()
      .reverse()
      .map((m: { direction: 'inbound' | 'outbound'; content: string | null }) => ({
        direction: m.direction,
        content: m.content,
      }));
    if (ordered.length === 0) return;

    const transcript = buildTranscript(ordered);
    const raw = await callAI(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      { model: 'openai/gpt-4o-mini', temperature: 0, maxTokens: 300, jsonMode: true, workspaceId, task: 'lead_classify' },
    );
    if (!raw) return;

    const classification = parseClassification(raw);
    if (!classification) return;

    const leadRow: LeadRow = {
      id: lead.id,
      workspace_id: lead.workspace_id,
      contact_id: lead.contact_id,
      stage: lead.stage,
      follow_up_at: lead.follow_up_at,
      temperature: lead.temperature ?? null,
    };
    const writes = applyLeadClassification(leadRow, classification, new Date());

    await db.from('leads').update(writes.leadUpdate).eq('id', leadId).eq('workspace_id', workspaceId);

    if (writes.historyRow) {
      await db.from('lead_stage_history').insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        actor_id: null,
        ...writes.historyRow,
      });
    }

    if (writes.scoreHistoryRow) {
      await db.from('lead_score_history').insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        ...writes.scoreHistoryRow,
      });
    }

    if (writes.promoteContact && leadRow.contact_id) {
      await db
        .from('contacts')
        .update({ lifecycle_stage: 'customer' })
        .eq('id', leadRow.contact_id)
        .eq('workspace_id', workspaceId);
    }
  } catch (err) {
    console.error('[lead-classifier] classifyLeadPipeline failed:', err instanceof Error ? err.message : String(err));
  }
}
