import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { categorizeMessage, fetchKnowledgeBaseContext, getAIReply } from '@/lib/ai-reply';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { workspaceId?: string; message?: string; customerName?: string };
    const { workspaceId, message, customerName } = body;

    if (!workspaceId || !message?.trim()) {
      return NextResponse.json({ error: 'workspaceId and message required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const supabase = createAdminClient();
    const { data: ws } = await (supabase as any)
      .from('workspaces')
      .select('settings, name')
      .eq('id', workspaceId)
      .single();

    const wsSettings = (ws?.settings ?? {}) as Record<string, unknown>;
    const businessName = (ws?.name as string | undefined) ?? 'our team';
    const name = customerName?.trim() || 'there';

    const [kbContext, intentLabel] = await Promise.all([
      fetchKnowledgeBaseContext(supabase, workspaceId, message),
      categorizeMessage(message),
    ]);

    const reply = await getAIReply(message, name, kbContext, undefined, wsSettings, businessName, [], intentLabel);

    return NextResponse.json({ reply, kbContext, intentLabel });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[KB Test-Reply]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
