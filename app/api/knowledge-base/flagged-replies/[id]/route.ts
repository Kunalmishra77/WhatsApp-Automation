import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = createAdminClient();
    const { data: flag } = await (supabase as any)
      .from('bot_reply_feedback')
      .select('workspace_id')
      .eq('id', id)
      .single();

    if (!flag) {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    }

    await requireWorkspacePermission(flag.workspace_id, 'manage_workspace');

    const { error } = await (supabase as any)
      .from('bot_reply_feedback')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Flagged Replies Resolve]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
