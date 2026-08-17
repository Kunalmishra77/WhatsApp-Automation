import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { hasFeature } from '@/lib/plan-features';

export const runtime = 'nodejs';

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

// POST /api/leads/[id]/conversion — { action: 'confirm' | 'undo' }
// Lets a human review an AI-marked conversion (leads.stage === 'converted' &&
// conversion_reviewed === false, set by lib/lead-classifier.ts's
// applyLeadClassification()). 'confirm' just marks it reviewed; 'undo' reverts
// the stage to whatever it was before the AI moved it to 'converted' (read from
// the latest lead_stage_history row) and logs a 'manual' history row for the
// revert, mirroring how a human stage change is recorded in the PATCH route.
export async function POST(
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

    const body = await request.json() as { action?: string };
    if (body.action !== 'confirm' && body.action !== 'undo') {
      return NextResponse.json({ error: 'action must be "confirm" or "undo"' }, { status: 400 });
    }

    if (currentStage !== 'converted') {
      return NextResponse.json({ error: 'Lead is not in the converted stage' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    if (body.action === 'confirm') {
      const { data, error } = await db
        .from('leads')
        .update({ conversion_reviewed: true, updated_at: new Date().toISOString() })
        .eq('id', leadId)
        .select('*, contacts(name, phone, avatar_url)')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ lead: data });
    }

    // action === 'undo' — find what the lead's stage was right before the AI
    // moved it to 'converted' (the most recent history row for this lead).
    const { data: lastHistory } = await db
      .from('lead_stage_history')
      .select('from_stage')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const revertedStage = (lastHistory?.from_stage as string | null) ?? 'interested';

    const { data, error } = await db
      .from('leads')
      .update({
        stage: revertedStage,
        stage_source: 'manual',
        converted_signal: null,
        closed_at: null,
        conversion_reviewed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .select('*, contacts(name, phone, avatar_url)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: historyError } = await db.from('lead_stage_history').insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      from_stage: 'converted',
      to_stage: revertedStage,
      source: 'manual',
      reason: 'conversion undone',
      confidence: null,
      actor_id: authz.userId,
    });
    if (historyError) {
      console.error('[Leads Conversion POST] lead_stage_history insert failed', historyError);
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Leads Conversion POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
