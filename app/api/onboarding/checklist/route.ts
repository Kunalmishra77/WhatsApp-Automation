import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/onboarding/checklist?workspaceId=xxx
// Returns quick-start completion state for the workspace.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;

    const [wsRes, contactsRes, campaignsRes, automationsRes] = await Promise.all([
      db.from('workspaces').select('phone_number_id').eq('id', workspaceId).single(),
      db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      db.from('campaigns').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      db.from('chatbot_flows').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ]);

    return NextResponse.json({
      whatsapp_connected: !!(wsRes.data?.phone_number_id),
      has_contacts:       (contactsRes.count ?? 0) > 0,
      has_campaigns:      (campaignsRes.count ?? 0) > 0,
      has_automations:    (automationsRes.count ?? 0) > 0,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Checklist] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
