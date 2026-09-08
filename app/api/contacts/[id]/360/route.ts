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
    const [contactRes, conversationsRes, ordersRes, csatRes, activitiesRes, notesRes, customFieldDefsRes] = await Promise.all([
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

      // Contact notes
      db.from('contact_notes')
        .select('id, content, created_at, created_by, profiles:created_by(full_name, email)')
        .eq('contact_id', contactId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50),

      // Custom field definitions for this workspace
      db.from('custom_field_definitions')
        .select('id, name, label, field_type, options')
        .eq('workspace_id', workspaceId)
        .order('created_at'),
    ]);

    const contact = contactRes.data;
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const conversations      = conversationsRes.data      ?? [];
    const orders             = ordersRes.data             ?? [];
    const csatResponses      = csatRes.data               ?? [];
    const activities         = activitiesRes.data         ?? [];
    const notes              = notesRes.data              ?? [];
    const customFieldDefs    = customFieldDefsRes.data    ?? [];

    // Stats — computed from exact counts / a full order scan, NOT the capped display lists
    // above (which cap at 20 conversations / 10 orders). Deriving totals from those would
    // silently understate a repeat customer's true conversation count and lifetime spend.
    const [totalConvRes, resolvedConvRes, totalOrdersRes] = await Promise.all([
      db.from('conversations').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('workspace_id', workspaceId),
      db.from('conversations').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('workspace_id', workspaceId).eq('status', 'resolved'),
      db.from('orders').select('id', { count: 'exact', head: true }).eq('contact_id', contactId).eq('workspace_id', workspaceId),
    ]);
    const totalConversations    = totalConvRes.count ?? 0;
    const resolvedConversations = resolvedConvRes.count ?? 0;
    const totalOrders           = totalOrdersRes.count ?? 0;

    // Lifetime spend — sum every order (a contact's orders are few; paginate to be safe).
    let totalSpent = 0;
    let oOff = 0;
    while (true) {
      const { data: pg } = await db
        .from('orders')
        .select('total_amount')
        .eq('contact_id', contactId)
        .eq('workspace_id', workspaceId)
        .range(oOff, oOff + 999);
      if (!pg?.length) break;
      for (const o of pg as Array<{ total_amount: number | null }>) totalSpent += (o.total_amount ?? 0);
      if (pg.length < 1000) break;
      oOff += 1000;
    }

    const avgCsat = csatResponses.length > 0
      ? Math.round((csatResponses as Array<{ score: number }>).reduce((s, r) => s + r.score, 0) / csatResponses.length * 10) / 10
      : null;

    return NextResponse.json({
      contact,
      stats: { totalConversations, resolvedConversations, avgCsat, totalOrders, totalSpent },
      conversations,
      orders,
      csatResponses,
      activities,
      notes,
      customFieldDefs,
    });
  } catch (error) {
    return authzResponse(error);
  }
}
