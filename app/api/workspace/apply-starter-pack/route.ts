import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { getVertical } from '@/lib/verticals';

export const runtime = 'nodejs';

// POST /api/workspace/apply-starter-pack  Body: { workspaceId, vertical }
// Seeds vertical-tailored quick replies + an AI persona (persona only if empty).
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, vertical } = await request.json() as { workspaceId?: string; vertical?: string };
    if (!workspaceId || !vertical) return NextResponse.json({ error: 'workspaceId and vertical required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const v = getVertical(vertical);
    if (!v) return NextResponse.json({ error: 'Unknown vertical' }, { status: 400 });

    const db = createAdminClient() as any;

    // Quick replies — insert only the shortcuts that don't already exist.
    const { data: existing } = await db
      .from('quick_replies')
      .select('shortcut')
      .eq('workspace_id', workspaceId);
    const have = new Set(((existing ?? []) as Array<{ shortcut: string }>).map((r) => r.shortcut));
    const toInsert = v.quickReplies
      .filter((q) => !have.has(q.shortcut))
      .map((q) => ({ workspace_id: workspaceId, shortcut: q.shortcut, title: q.title, content: q.content, category: 'general' }));
    let quickRepliesAdded = 0;
    if (toInsert.length > 0) {
      const { error } = await db.from('quick_replies').insert(toInsert);
      if (!error) quickRepliesAdded = toInsert.length;
    }

    // Persona — set only if the workspace has none yet (never overwrite).
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = (ws?.settings ?? {}) as Record<string, unknown>;
    let personaSet = false;
    if (!((settings.agent_persona as string | undefined)?.trim())) {
      await db.from('workspaces')
        .update({ settings: { ...settings, agent_persona: v.persona, industry: v.key } })
        .eq('id', workspaceId);
      personaSet = true;
    } else {
      await db.from('workspaces')
        .update({ settings: { ...settings, industry: v.key } })
        .eq('id', workspaceId);
    }

    return NextResponse.json({ vertical: v.key, quickRepliesAdded, personaSet, campaignIdeas: v.campaignIdeas });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[apply-starter-pack]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
