import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { readLeadRules, DEFAULT_THRESHOLDS } from '@/lib/lead-classifier';

export const runtime = 'nodejs';

// GET /api/lead-rules?workspaceId=... → current lead-classification config.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
    const rules = readLeadRules(ws?.settings);
    const isDefault = !((ws?.settings ?? {}) as Record<string, unknown>).lead_rules;
    return NextResponse.json({ rules, defaults: DEFAULT_THRESHOLDS, is_default: isDefault });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadRules GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/lead-rules  Body: { workspaceId, thresholds: {hot, warm}, guidance }
// Saves the per-client rules (merged into workspaces.settings.lead_rules).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { workspaceId?: string; thresholds?: { hot?: number; warm?: number }; guidance?: string };
    const { workspaceId } = body;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    // Validate thresholds: 1 <= warm < hot <= 100.
    const hot = Math.round(Number(body.thresholds?.hot));
    const warm = Math.round(Number(body.thresholds?.warm));
    if (!Number.isFinite(hot) || !Number.isFinite(warm) || warm < 1 || hot > 100 || warm >= hot) {
      return NextResponse.json({ error: 'Thresholds must satisfy 1 ≤ warm < hot ≤ 100' }, { status: 400 });
    }
    const guidance = typeof body.guidance === 'string' ? body.guidance.trim().slice(0, 1200) : '';

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = { ...((ws?.settings ?? {}) as Record<string, unknown>) };
    settings.lead_rules = { thresholds: { hot, warm }, guidance: guidance || undefined };

    const { error } = await db.from('workspaces').update({ settings }).eq('id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rules: readLeadRules(settings) });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadRules POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
