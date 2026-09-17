import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { runWorkspaceRankCheck } from '@/lib/local-rank';

export const runtime = 'nodejs';

// POST /api/local-rank/check  Body: { workspaceId }
// Re-checks the rank of every tracked keyword for the workspace now.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
      return NextResponse.json({ error: 'Places API key not configured' }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const result = await runWorkspaceRankCheck(db, workspaceId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[LocalRank check]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
