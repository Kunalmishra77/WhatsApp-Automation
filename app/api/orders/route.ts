import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/orders?workspaceId=&orderRef= — look up order status
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const orderRef = request.nextUrl.searchParams.get('orderRef');

    if (!workspaceId || !orderRef) {
      return NextResponse.json({ error: 'Missing workspaceId or orderRef' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const supabase = createAdminClient();
    const db = supabase as any;

    const { data: order, error } = await db
      .from('orders')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('order_ref', orderRef)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    return NextResponse.json({ order });
  } catch (error) {
    return authzResponse(error);
  }
}

// GET /api/orders/list?workspaceId= — list all orders
// POST /api/orders — create/update order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      orderRef?: string;
      status?: string;
      customerName?: string;
      itemsSummary?: string;
      totalAmount?: number;
      currency?: string;
      expectedAt?: string;
      notes?: string;
      contactId?: string;
    };

    const {
      workspaceId,
      orderRef,
      status = 'pending',
      customerName,
      itemsSummary,
      totalAmount,
      currency = 'INR',
      expectedAt,
      notes,
      contactId,
    } = body;

    if (!workspaceId || !orderRef) {
      return NextResponse.json({ error: 'workspaceId and orderRef are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const supabase = createAdminClient();
    const db = supabase as any;

    const { data: order, error } = await db
      .from('orders')
      .upsert(
        {
          workspace_id: workspaceId,
          order_ref: orderRef,
          status,
          customer_name: customerName,
          items_summary: itemsSummary,
          total_amount: totalAmount,
          currency,
          expected_at: expectedAt,
          notes,
          contact_id: contactId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,order_ref' },
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return authzResponse(error);
  }
}

// PATCH /api/orders — update order status
export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId, orderRef, status, notes, expectedAt } = await request.json() as {
      workspaceId?: string;
      orderRef?: string;
      status?: string;
      notes?: string;
      expectedAt?: string;
    };

    if (!workspaceId || !orderRef || !status) {
      return NextResponse.json({ error: 'workspaceId, orderRef, and status are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const supabase = createAdminClient();
    const db = supabase as any;

    const { data: order, error } = await db
      .from('orders')
      .update({
        status,
        notes,
        expected_at: expectedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('order_ref', orderRef)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ order });
  } catch (error) {
    return authzResponse(error);
  }
}
