import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/contacts/list?workspaceId=&search=&pageSize=200
export async function GET(request: NextRequest) {
  try {
    const sp          = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    const search      = sp.get('search') ?? '';
    const pageSize    = Math.min(parseInt(sp.get('pageSize') ?? '200', 10), 500);

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db = createAdminClient() as any;

    let query = db
      .from('contacts')
      .select('id, name, phone, tags')
      .eq('workspace_id', workspaceId)
      .eq('opted_out', false)
      .eq('is_blocked', false)
      .order('name', { ascending: true })
      .limit(pageSize);

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Contacts List]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
