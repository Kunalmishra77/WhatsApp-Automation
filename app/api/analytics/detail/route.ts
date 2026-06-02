import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/analytics/detail?workspaceId=&type=open|resolved|new-contacts|csat|inbound|outbound&from=&to=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspaceId');
    const type        = searchParams.get('type');
    const from        = searchParams.get('from') ?? '';
    const to          = searchParams.get('to')   ?? '';

    if (!workspaceId || !type) return NextResponse.json({ error: 'workspaceId and type required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    if (type === 'open' || type === 'resolved' || type === 'pending' || type === 'assigned') {
      const { data } = await db
        .from('conversations')
        .select('id, status, created_at, updated_at, contacts(id, name, phone), assigned_agent:profiles!assigned_agent_id(full_name)')
        .eq('workspace_id', workspaceId)
        .eq('status', type)
        .order('updated_at', { ascending: false })
        .limit(100);

      return NextResponse.json({ rows: data ?? [] });
    }

    if (type === 'new-contacts') {
      const { data } = await db
        .from('contacts')
        .select('id, name, phone, email, tags, created_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(100);

      return NextResponse.json({ rows: data ?? [] });
    }

    if (type === 'csat') {
      const { data } = await db
        .from('csat_responses')
        .select('id, score, comment, responded_at, contacts(name, phone), profiles!agent_id(full_name)')
        .eq('workspace_id', workspaceId)
        .not('score', 'is', null)
        .gte('responded_at', `${from}T00:00:00.000Z`)
        .lte('responded_at', `${to}T23:59:59.999Z`)
        .order('responded_at', { ascending: false })
        .limit(200);

      return NextResponse.json({ rows: data ?? [] });
    }

    if (type === 'inbound' || type === 'outbound') {
      const { data } = await db
        .from('messages')
        .select('id, content, type, status, created_at, sender_type, contacts!messages_sender_id_fkey(name, phone)')
        .eq('workspace_id', workspaceId)
        .eq('direction', type)
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(200);

      return NextResponse.json({ rows: data ?? [] });
    }

    if (type === 'delivery') {
      // Messages by delivery status breakdown
      const { data } = await db
        .from('messages')
        .select('status')
        .eq('workspace_id', workspaceId)
        .eq('direction', 'outbound')
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`);

      const buckets: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
      for (const r of (data ?? []) as Array<{ status: string }>) {
        const s = r.status;
        if (s in buckets) (buckets as any)[s]++;
      }
      return NextResponse.json({ buckets, rows: [] });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Analytics Detail]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
