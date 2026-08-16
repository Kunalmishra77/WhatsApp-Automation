import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { AuthzError, authzResponse, requireWorkspacePermission } from '@/lib/authz';
import { NATIVE_FLOW_TEMPLATES } from '@/lib/native-flows';

export const runtime = 'nodejs';

// Lists the workspace's native (non-endpoint) WhatsApp Flow "forms": every
// available template plus its publish state (if any) from `flows_meta`, so
// the "WhatsApp Forms" UI and the conversation composer's "Send form" item
// both know what's already published vs. still draft.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db = createAdminClient() as any;

    const { data: published } = await db
      .from('flows_meta')
      .select('id, template_key, meta_flow_id, name, status, updated_at')
      .eq('workspace_id', workspaceId);

    const templates = Object.values(NATIVE_FLOW_TEMPLATES).map((t) => ({ key: t.key, name: t.name }));

    return NextResponse.json({ templates, published: published ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) {
      return authzResponse(error);
    }

    console.error('[FlowsNative/List] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
