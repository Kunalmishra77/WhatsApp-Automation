import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { hasFeature } from '@/lib/plan-features';

async function getLeadWorkspaceId(leadId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('leads')
    .select('workspace_id')
    .eq('id', leadId)
    .single();
  return (data?.workspace_id as string) ?? null;
}

// Same lookup as getLeadWorkspaceId, but also returns the lead's current stage so
// PATCH can tell whether an incoming body.stage is a real change (and log it).
async function getLeadWorkspaceAndStage(
  leadId: string,
): Promise<{ workspaceId: string; stage: string } | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('leads')
    .select('workspace_id, stage')
    .eq('id', leadId)
    .single();
  if (!data?.workspace_id) return null;
  return { workspaceId: data.workspace_id as string, stage: data.stage as string };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;

    const leadInfo = await getLeadWorkspaceAndStage(leadId);
    if (!leadInfo) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const { workspaceId, stage: currentStage } = leadInfo;

    const authz = await requireWorkspacePermission(workspaceId, 'manage_leads');

    // Check CRM feature access
    const { data: ws } = await (createAdminClient() as any).from('workspaces').select('plan').eq('id', workspaceId).single();
    if (!hasFeature(ws?.plan ?? 'free', 'crm')) {
      return NextResponse.json(
        { error: 'CRM is not available on your current plan. Please upgrade to Pro.' },
        { status: 403 },
      );
    }

    const body = await request.json() as {
      stage?: string;
      title?: string;
      value?: number | null;
      notes?: string | null;
      priority?: string;
      follow_up_at?: string | null;
      assigned_agent_id?: string | null;
    };

    // A "manual" stage change is any request that supplies a stage different from
    // the lead's current one — the AI classifier (lib/lead-classifier.ts) is the
    // only other writer of `stage` and it goes through its own admin-client path,
    // never this route, so any stage change arriving here is a human move.
    const isStageChange = body.stage !== undefined && body.stage !== currentStage;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.stage             !== undefined) patch.stage             = body.stage;
    if (body.title             !== undefined) patch.title             = body.title;
    if (body.value             !== undefined) patch.value             = body.value;
    if (body.notes             !== undefined) patch.notes             = body.notes;
    if (body.priority          !== undefined) patch.priority          = body.priority;
    if (body.follow_up_at      !== undefined) patch.follow_up_at      = body.follow_up_at;
    if (body.assigned_agent_id !== undefined) patch.assigned_agent_id = body.assigned_agent_id;
    if (isStageChange) patch.stage_source = 'manual';

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('leads')
      .update(patch)
      .eq('id', leadId)
      .select('*, contacts(name, phone, avatar_url)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (isStageChange) {
      const { error: historyError } = await (supabase as any).from('lead_stage_history').insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        from_stage: currentStage,
        to_stage: body.stage,
        source: 'manual',
        reason: null,
        confidence: null,
        actor_id: authz.userId,
      });
      if (historyError) {
        console.error('[Leads PATCH] lead_stage_history insert failed', historyError);
      }
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Leads PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;

    const workspaceId = await getLeadWorkspaceId(leadId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_leads');

    // Check CRM feature access
    const { data: wsDelete } = await (createAdminClient() as any).from('workspaces').select('plan').eq('id', workspaceId).single();
    if (!hasFeature(wsDelete?.plan ?? 'free', 'crm')) {
      return NextResponse.json(
        { error: 'CRM is not available on your current plan. Please upgrade to Pro.' },
        { status: 403 },
      );
    }

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Leads DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
