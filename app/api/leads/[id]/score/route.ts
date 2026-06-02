import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

// POST /api/leads/[id]/score
// Calculates AI lead score 0-100 and saves it. Returns { score }.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: leadId } = await params;
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    // Fetch the lead + linked conversation messages
    const { data: lead } = await db
      .from('leads')
      .select('id, contact_id, conversation_id, notes, value, stage, created_at')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    let score = 30; // base score

    // Stage scoring (higher stage = higher score)
    const stageBonus: Record<string, number> = {
      new: 0, contacted: 10, follow_up: 15, interested: 25, converted: 40, lost: -20,
    };
    score += stageBonus[lead.stage as string] ?? 0;

    // Value scoring — higher deal value = more points (up to 15)
    if (lead.value > 0) {
      score += Math.min(15, Math.floor(lead.value / 10000) * 3);
    }

    // Recency — created recently = more points
    const ageHours = (Date.now() - new Date(lead.created_at).getTime()) / 3_600_000;
    if (ageHours < 24) score += 10;
    else if (ageHours < 72) score += 5;

    // Conversation engagement scoring
    if (lead.conversation_id) {
      const { data: messages } = await db
        .from('messages')
        .select('direction, content, created_at')
        .eq('conversation_id', lead.conversation_id)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (messages?.length) {
        const inbound  = (messages as Array<{ direction: string; content: string }>).filter((m) => m.direction === 'inbound');
        const outbound = (messages as Array<{ direction: string; content: string }>).filter((m) => m.direction === 'outbound');

        // Reply frequency
        score += Math.min(10, inbound.length * 2);

        // Agent responded
        if (outbound.length > 0) score += 5;

        // Buying keywords in messages
        const buyKeywords = ['buy', 'purchase', 'price', 'cost', 'interested', 'when', 'how much', 'demo', 'trial', 'order'];
        const allText = inbound.map((m) => (m.content ?? '').toLowerCase()).join(' ');
        const keywordHits = buyKeywords.filter((kw) => allText.includes(kw)).length;
        score += Math.min(10, keywordHits * 3);
      }
    }

    // Notes filled = more engaged
    if (lead.notes?.trim()) score += 5;

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Save to DB
    await db.from('leads').update({ ai_score: score }).eq('id', leadId);

    return NextResponse.json({ score });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
