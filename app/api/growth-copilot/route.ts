import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Action {
  id: string;
  type: 'review' | 'question' | 'lead' | 'conversation';
  priority: 1 | 2 | 3;   // 1 = urgent
  title: string;
  detail: string;
  href: string;
}

// GET /api/growth-copilot?workspaceId=
// Aggregates "what to act on now" across GBP, leads and conversations into one
// prioritized action list — the AI Growth Copilot's daily to-do.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const actions: Action[] = [];

    // 1) Unanswered GBP reviews — negatives are urgent.
    const { data: reviews } = await db
      .from('gbp_reviews')
      .select('id, reviewer_name, star_rating, comment, reply_status')
      .eq('workspace_id', workspaceId)
      .eq('reply_status', 'none')
      .order('create_time', { ascending: false })
      .limit(50);
    for (const r of (reviews ?? []) as Array<{ id: string; reviewer_name: string | null; star_rating: number | null; comment: string | null }>) {
      const low = (r.star_rating ?? 5) <= 3;
      actions.push({
        id: `review:${r.id}`,
        type: 'review',
        priority: low ? 1 : 2,
        title: `${low ? 'Negative' : 'New'} review from ${r.reviewer_name ?? 'a customer'} (${r.star_rating ?? '?'}★)`,
        detail: r.comment?.slice(0, 120) ?? 'Reply to keep your rating strong.',
        href: '/google-business',
      });
    }

    // 2) Unanswered GBP questions.
    const { data: questions } = await db
      .from('gbp_questions')
      .select('id, text, answer_status')
      .eq('workspace_id', workspaceId)
      .eq('answer_status', 'none')
      .limit(50);
    for (const q of (questions ?? []) as Array<{ id: string; text: string | null }>) {
      actions.push({
        id: `question:${q.id}`,
        type: 'question',
        priority: 2,
        title: 'Unanswered question on your Google profile',
        detail: q.text?.slice(0, 120) ?? 'Answer to help customers find you.',
        href: '/google-business',
      });
    }

    // 3) Cold leads that aren't closed — re-engage.
    const { data: coldLeads } = await db
      .from('leads')
      .select('id, title, temperature, stage, contact_id')
      .eq('workspace_id', workspaceId)
      .eq('temperature', 'cold')
      .not('stage', 'in', '("converted","lost")')
      .order('created_at', { ascending: false })
      .limit(30);
    for (const l of (coldLeads ?? []) as Array<{ id: string; title: string | null }>) {
      actions.push({
        id: `lead:${l.id}`,
        type: 'lead',
        priority: 3,
        title: `Cold lead going quiet: ${l.title ?? 'Lead'}`,
        detail: 'Send a WhatsApp offer or follow-up to re-engage.',
        href: '/crm',
      });
    }

    // 4) Pending conversations waiting on a human.
    const { count: pendingCount } = await db
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending');
    if ((pendingCount ?? 0) > 0) {
      actions.push({
        id: 'conversations:pending',
        type: 'conversation',
        priority: 1,
        title: `${pendingCount} conversation${pendingCount === 1 ? '' : 's'} waiting for a reply`,
        detail: 'Customers are waiting — jump into the inbox.',
        href: '/conversations',
      });
    }

    actions.sort((a, b) => a.priority - b.priority);

    const summary = {
      total: actions.length,
      urgent: actions.filter((a) => a.priority === 1).length,
      reviews: actions.filter((a) => a.type === 'review').length,
      questions: actions.filter((a) => a.type === 'question').length,
      leads: actions.filter((a) => a.type === 'lead').length,
    };

    return NextResponse.json({ actions, summary });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[growth-copilot]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
