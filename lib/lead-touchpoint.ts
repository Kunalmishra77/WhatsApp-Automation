// lib/lead-touchpoint.ts
// Phase 1 (Unified Lead Hub) — the single DB writer every channel calls to
// attribute a lead/contact. Thin & fail-open: a failure logs and returns
// null; it must NEVER throw into (and break) the caller's create flow.
// Pure decision logic lives in lib/lead-attribution.ts.

import type { Channel } from '@/lib/lead-attribution';
import { mergeTouch, type TouchTimes } from '@/lib/lead-attribution';

export type TouchRefType =
  | 'conversation'
  | 'campaign'
  | 'meta_lead'
  | 'google_lead'
  | 'gbp_review'
  | 'form'
  | 'manual';

export interface RecordTouchpointInput {
  workspaceId: string;
  contactId?: string | null;
  leadId?: string | null;
  channel: Channel;
  sourceDetail?: string | null;
  refType?: TouchRefType | null;
  refId?: string | null;
  occurredAt?: string | null; // ISO; defaults to now
  metadata?: Record<string, unknown>;
  /** UTM params — only stored on the lead/contact rows, not the touchpoint. */
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    content?: string | null;
    term?: string | null;
  } | null;
}

/**
 * Record one marketing touchpoint and roll it into the contact's (and lead's)
 * first/last-touch attribution. Accepts any Supabase client (admin or RLS) as
 * `db`, so it works from webhooks and from client-side services alike.
 * Returns the new touchpoint id, or null on any failure (fail-open).
 */
export async function recordTouchpoint(
  db: any,
  input: RecordTouchpointInput,
): Promise<string | null> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  try {
    if (!input.workspaceId || !input.channel) return null;

    // 1) Insert the touchpoint row (the journey timeline entry).
    const { data: tp, error: tpErr } = await db
      .from('marketing_touchpoints')
      .insert({
        workspace_id: input.workspaceId,
        contact_id: input.contactId ?? null,
        lead_id: input.leadId ?? null,
        channel: input.channel,
        source_detail: input.sourceDetail ?? null,
        ref_type: input.refType ?? null,
        ref_id: input.refId ?? null,
        occurred_at: occurredAt,
        metadata: input.metadata ?? {},
      })
      .select('id')
      .single();

    if (tpErr) {
      console.error('[touchpoint] insert failed:', tpErr.message ?? tpErr);
      // still try to update first/last touch below — the timeline row is not
      // essential to the attribution columns.
    }

    // 2) Roll first/last touch onto the contact.
    if (input.contactId) {
      await applyTouchTimes(db, 'contacts', input.contactId, input.workspaceId, {
        channel: input.channel,
        at: occurredAt,
      }, input);
    }

    // 3) Roll first/last touch onto the lead (if this touch created/updated one).
    if (input.leadId) {
      await applyTouchTimes(db, 'leads', input.leadId, input.workspaceId, {
        channel: input.channel,
        at: occurredAt,
      }, input);
    }

    return tp?.id ?? null;
  } catch (err) {
    console.error('[touchpoint] recordTouchpoint error:', err);
    return null;
  }
}

async function applyTouchTimes(
  db: any,
  table: 'contacts' | 'leads',
  id: string,
  workspaceId: string,
  incoming: { channel: Channel; at: string },
  input: RecordTouchpointInput,
): Promise<void> {
  try {
    const { data: row, error } = await db
      .from(table)
      .select('channel, source_detail, first_touch_channel, first_touch_at, last_touch_channel, last_touch_at')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !row) return;

    const existing: TouchTimes = {
      firstChannel: row.first_touch_channel ?? null,
      firstAt: row.first_touch_at ?? null,
      lastChannel: row.last_touch_channel ?? null,
      lastAt: row.last_touch_at ?? null,
    };
    const merged = mergeTouch(existing, incoming);

    const patch: Record<string, unknown> = {
      first_touch_channel: merged.firstChannel,
      first_touch_at: merged.firstAt,
      last_touch_channel: merged.lastChannel,
      last_touch_at: merged.lastAt,
    };

    // Seed the primary channel/source_detail once (never overwrite an existing one).
    if (!row.channel) patch.channel = input.channel;
    if (!row.source_detail && input.sourceDetail) patch.source_detail = input.sourceDetail;

    // UTM columns exist on both leads and contacts (migration 087) — set once.
    if (input.utm && table === 'leads') {
      if (input.utm.source) patch.utm_source = input.utm.source;
      if (input.utm.medium) patch.utm_medium = input.utm.medium;
      if (input.utm.campaign) patch.utm_campaign = input.utm.campaign;
      if (input.utm.content) patch.utm_content = input.utm.content;
      if (input.utm.term) patch.utm_term = input.utm.term;
    }

    await db.from(table).update(patch).eq('id', id).eq('workspace_id', workspaceId);
  } catch (err) {
    console.error(`[touchpoint] applyTouchTimes(${table}) error:`, err);
  }
}
