import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { hasFeature } from '@/lib/plan-features';
import { classifyLeadPipeline } from '@/lib/lead-classifier';

export const runtime = 'nodejs';

async function getLead(leadId: string): Promise<{ id: string; workspace_id: string; conversation_id: string | null } | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('leads')
    .select('id, workspace_id, conversation_id')
    .eq('id', leadId)
    .single();
  return data ?? null;
}

// On-demand "Re-analyze" — runs the same AI classifier the inbound path triggers
// automatically, but on request (e.g. an agent clicking "Re-analyze" on a lead
// that's gone stale). classifyLeadPipeline() never throws and no-ops on failure,
// so this route always returns 200 once authorized, even if classification itself
// didn't produce a change.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;

    const lead = await getLead(leadId);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await requireWorkspacePermission(lead.workspace_id, 'manage_leads');

    // Check CRM feature access
    const { data: ws } = await (createAdminClient() as any).from('workspaces').select('plan').eq('id', lead.workspace_id).single();
    if (!hasFeature(ws?.plan ?? 'free', 'crm')) {
      return NextResponse.json(
        { error: 'CRM is not available on your current plan. Please upgrade to Pro.' },
        { status: 403 },
      );
    }

    if (!lead.conversation_id) {
      return NextResponse.json({ ok: true, skipped: 'no conversation' });
    }

    await classifyLeadPipeline({
      conversationId: lead.conversation_id,
      workspaceId: lead.workspace_id,
      leadId: lead.id,
    });

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('leads')
      .select('*, contacts(name, phone, avatar_url)')
      .eq('id', leadId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Leads Classify POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
