import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/cron/check-sla-breaches?secret=
export async function GET(request: NextRequest) {
  const secret  = request.nextUrl.searchParams.get('secret') ?? '';
  const allowed = secret === (process.env.CRON_SECRET ?? 'agentix2026cron') || request.headers.get('x-vercel-cron') === '1';
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const now = new Date();

  // Find all workspaces with SLA enabled
  const { data: policies } = await db
    .from('sla_policies')
    .select('workspace_id, first_response_hours, resolution_hours')
    .eq('is_enabled', true);

  if (!policies || policies.length === 0) return NextResponse.json({ checked: 0 });

  let breachMarked = 0;

  for (const policy of policies as Array<{ workspace_id: string; first_response_hours: number; resolution_hours: number }>) {
    // First response SLA breach: open conversations without first reply past deadline
    const frDeadline = new Date(now.getTime() - policy.first_response_hours * 60 * 60 * 1000).toISOString();

    const { data: frBreached } = await db
      .from('conversations')
      .select('id')
      .eq('workspace_id', policy.workspace_id)
      .eq('status', 'open')
      .eq('sla_first_breach', false)
      .is('first_replied_at', null)
      .lt('created_at', frDeadline);

    if (frBreached && frBreached.length > 0) {
      const ids = (frBreached as Array<{ id: string }>).map((c) => c.id);
      await db.from('conversations').update({ sla_first_breach: true }).in('id', ids);

      // Create notifications for agents
      for (const convId of ids) {
        await db.from('notifications').insert({
          workspace_id: policy.workspace_id,
          type:         'sla_breach',
          title:        '⚠️ SLA Breach — First Response',
          body:         'A conversation has exceeded the first response SLA.',
          entity_type:  'conversation',
          entity_id:    convId,
        }).catch(() => {});
      }
      breachMarked += ids.length;
    }

    // Resolution SLA breach
    const resDeadline = new Date(now.getTime() - policy.resolution_hours * 60 * 60 * 1000).toISOString();
    const { data: resBreached } = await db
      .from('conversations')
      .select('id')
      .eq('workspace_id', policy.workspace_id)
      .eq('status', 'open')
      .eq('sla_resolve_breach', false)
      .lt('created_at', resDeadline);

    if (resBreached && resBreached.length > 0) {
      const ids = (resBreached as Array<{ id: string }>).map((c) => c.id);
      await db.from('conversations').update({ sla_resolve_breach: true }).in('id', ids);
      breachMarked += ids.length;
    }
  }

  return NextResponse.json({ checked: policies.length, breachMarked });
}
