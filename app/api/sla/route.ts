import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';

export interface SlaPolicy {
  id?: string;
  workspace_id: string;
  is_enabled: boolean;
  first_response_hours: number;
  resolution_hours: number;
  breach_notify_agents: boolean;
}

// GET /api/sla?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const { data } = await db.from('sla_policies').select('*').eq('workspace_id', workspaceId).maybeSingle();

    return NextResponse.json({ policy: data ?? null });
  } catch (e) { return authzResponse(e); }
}

// POST /api/sla — upsert
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, isEnabled, firstResponseHours, resolutionHours, breachNotifyAgents } = await request.json() as {
      workspaceId?: string;
      isEnabled?: boolean;
      firstResponseHours?: number;
      resolutionHours?: number;
      breachNotifyAgents?: boolean;
    };

    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('sla_policies')
      .upsert({
        workspace_id:          workspaceId,
        is_enabled:            isEnabled ?? false,
        first_response_hours:  firstResponseHours ?? 1,
        resolution_hours:      resolutionHours ?? 24,
        breach_notify_agents:  breachNotifyAgents ?? true,
        updated_at:            new Date().toISOString(),
      }, { onConflict: 'workspace_id' })
      .select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ policy: data });
  } catch (e) { return authzResponse(e); }
}
