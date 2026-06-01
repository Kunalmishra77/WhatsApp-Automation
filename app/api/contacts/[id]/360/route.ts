import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';

// GET /api/contacts/[id]/360?workspaceId=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contactId } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db = createAdminClient() as any;

    // Fetch all data in parallel
    const [contactRes, conversationsRes, ordersRes, csatRes, activitiesRes] = await Promise.all([
      // Contact info
      db.from('contacts').select('*').eq('id', contactId).eq('workspace_id', workspaceId).single(),

      // All conversations
      db.from('conversations')
        .select('id, status, channel, created_at, resolved_at, last_message, unread_count, assigned_agent_id, profiles:assigned_agent_id(full_name)')
        .eq('contact_id', contactId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(20),

      // Orders
      db.from('orders')
        .select('id, order_ref, status, total_amount, currency, created_at, expected_at')
        .eq('contact_id', contactId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10),

      // CSAT scores
      db.from('csat_responses')
        .select('score, responded_at, conversation_id')
        .eq('contact_id', contactId)
        .eq('workspace_id', workspaceId)
        .not('score', 'is', null)
        .order('responded_at', { ascending: false })
        .limit(10),

      // Recent activities
      db.from('activities')
        .select('action, entity_type, metadata, created_at')
        .eq('workspace_id', workspaceId)
        .or(`metadata->>'contact_id'.eq.${contactId},entity_id.eq.${contactId}`)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const contact = contactRes.data;
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const conversations  = conversationsRes.data  ?? [];
    const orders         = ordersRes.data         ?? [];
    const csatResponses  = csatRes.data            ?? [];
    const activities     = activitiesRes.data      ?? [];

    // Stats
    const totalConversations  = conversations.length;
    const resolvedConversations = (conversations as Array<{ status: string }>).filter((c) => c.status === 'resolved').length;
    const avgCsat = csatResponses.length > 0
      ? Math.round((csatResponses as Array<{ score: number }>).reduce((s, r) => s + r.score, 0) / csatResponses.length * 10) / 10
      : null;
    const totalOrders = orders.length;
    const totalSpent  = (orders as Array<{ total_amount: number | null }>).reduce((s, o) => s + (o.total_amount ?? 0), 0);

    return NextResponse.json({
      contact,
      stats: { totalConversations, resolvedConversations, avgCsat, totalOrders, totalSpent },
      conversations,
      orders,
      csatResponses,
      activities,
    });
  } catch (error) {
    return authzResponse(error);
  }
}
