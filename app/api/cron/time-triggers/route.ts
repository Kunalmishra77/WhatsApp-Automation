import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/cron/time-triggers?secret=<CRON_SECRET>
// Processes two kinds of triggers:
//   1. time_trigger_queue rows due for execution (send_message, auto_close, etc.)
//   2. workspace idle-close config — find conversations idle > N hours and queue auto-close
export async function GET(request: NextRequest) {
  const secret  = request.nextUrl.searchParams.get('secret') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const allowed    = !!cronSecret && secret === cronSecret;
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db  = createAdminClient() as any;
  const now = new Date();

  let executed = 0;
  let queued   = 0;

  // ── 1. Process due trigger queue rows ─────────────────────────────────────
  const { data: dueRows } = await db
    .from('time_trigger_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('trigger_at', now.toISOString())
    .limit(100);

  for (const row of (dueRows ?? []) as Array<Record<string, unknown>>) {
    try {
      await executeTriggerAction(db, row);
      await db
        .from('time_trigger_queue')
        .update({ status: 'executed', executed_at: now.toISOString() })
        .eq('id', row.id);
      executed++;
    } catch (err) {
      console.error('[TimeTriggers] Failed to execute row', row.id, err);
      await db
        .from('time_trigger_queue')
        .update({ status: 'failed' })
        .eq('id', row.id);
    }
  }

  // ── 2. Queue idle-close for workspaces that have it enabled ───────────────
  const { data: configs } = await db
    .from('workspace_time_trigger_config')
    .select('workspace_id, idle_close_hours, idle_message, idle_close_enabled')
    .eq('idle_close_enabled', true);

  for (const config of (configs ?? []) as Array<{
    workspace_id: string;
    idle_close_hours: number;
    idle_message: string | null;
  }>) {
    const idleThreshold = new Date(now.getTime() - config.idle_close_hours * 3_600_000).toISOString();

    // Find conversations idle past threshold (not already queued for auto-close)
    const { data: idleConvs } = await db
      .from('conversations')
      .select('id, contact_id')
      .eq('workspace_id', config.workspace_id)
      .in('status', ['open', 'pending'])
      .lt('last_message_at', idleThreshold)
      .limit(50);

    if (!idleConvs?.length) continue;

    for (const conv of idleConvs as Array<{ id: string; contact_id: string }>) {
      // Check if already queued
      const { count } = await db
        .from('time_trigger_queue')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('action_type', 'auto_close')
        .eq('status', 'pending');

      if ((count ?? 0) > 0) continue;

      // Queue auto-close (execute in 30 minutes to give a grace window)
      await db.from('time_trigger_queue').insert({
        workspace_id:    config.workspace_id,
        conversation_id: conv.id,
        contact_id:      conv.contact_id,
        trigger_at:      new Date(now.getTime() + 30 * 60_000).toISOString(),
        action_type:     'auto_close',
        action_data:     { idle_message: config.idle_message },
      });
      queued++;
    }
  }

  // ── 3. Resume stalled flow sessions (wait nodes) ──────────────────────────
  const { data: stalledSessions } = await db
    .from('flow_sessions')
    .select('id, flow_id, workspace_id, conversation_id, contact_id, current_node_id, context')
    .eq('status', 'active')
    .lte('context->>resume_at', now.toISOString())
    .not('context->>resume_at', 'is', null)
    .limit(50);

  for (const session of (stalledSessions ?? []) as Array<Record<string, unknown>>) {
    try {
      const { data: flow } = await db
        .from('chatbot_flows')
        .select('nodes, edges')
        .eq('id', session.flow_id)
        .single();

      if (!flow) continue;

      const { data: ws } = await db
        .from('workspaces')
        .select('phone_number_id, access_token')
        .eq('id', session.workspace_id)
        .single();

      if (!ws?.phone_number_id || !ws?.access_token) continue;

      const { data: contact } = await db
        .from('contacts')
        .select('phone')
        .eq('id', session.contact_id)
        .single();

      if (!contact?.phone) continue;

      // Find the next node after the wait node
      const edges = flow.edges as Array<{ source: string; target: string }>;
      const nodes = flow.nodes as Array<{ id: string }>;
      const nextEdge = edges.find((ed) => ed.source === session.current_node_id);
      if (!nextEdge) {
        await db.from('flow_sessions').update({ status: 'completed' }).eq('id', session.id);
        continue;
      }

      // Validate the target node still exists in the flow definition
      const targetExists = nodes.some((n) => n.id === nextEdge.target);
      if (!targetExists) {
        console.warn(`[TimeTriggers] Node ${nextEdge.target} not found in flow — ending session ${session.id}`);
        await db.from('flow_sessions').update({ status: 'completed' }).eq('id', session.id);
        continue;
      }

      // Advance session to next node
      await db
        .from('flow_sessions')
        .update({ current_node_id: nextEdge.target, context: {} })
        .eq('id', session.id);

      executed++;
    } catch (err) {
      console.error('[TimeTriggers] Failed to resume flow session', session.id, err);
    }
  }

  return NextResponse.json({ executed, queued });
}

async function executeTriggerAction(db: any, row: Record<string, unknown>) {
  const actionData = (row.action_data ?? {}) as Record<string, unknown>;

  if (row.action_type === 'auto_close') {
    // Verify conversation is still idle (hasn't been replied to since queuing)
    const { data: conv } = await db
      .from('conversations')
      .select('status, last_message_at')
      .eq('id', row.conversation_id)
      .single();

    if (!conv || conv.status === 'resolved') return;

    if (actionData.idle_message) {
      // Get workspace phone/token to send farewell message
      const { data: ws } = await db
        .from('workspaces')
        .select('phone_number_id, access_token')
        .eq('id', row.workspace_id)
        .single();

      const { data: contact } = await db
        .from('contacts')
        .select('phone')
        .eq('id', row.contact_id)
        .single();

      if (ws?.phone_number_id && ws?.access_token && contact?.phone) {
        await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${String(ws.access_token).replace(/﻿/g, '').trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: contact.phone,
            type: 'text',
            text: { body: String(actionData.idle_message) },
          }),
        }).catch(() => {});
      }
    }

    await db
      .from('conversations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', row.conversation_id);
  }

  if (row.action_type === 'send_message') {
    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', row.workspace_id)
      .single();

    const { data: contact } = await db
      .from('contacts')
      .select('phone')
      .eq('id', row.contact_id)
      .single();

    if (ws?.phone_number_id && ws?.access_token && contact?.phone) {
      await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${String(ws.access_token).replace(/﻿/g, '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: contact.phone,
          type: 'text',
          text: { body: String(actionData.message ?? '') },
        }),
      }).catch(() => {});
    }
  }
}
