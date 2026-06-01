import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { validateApiKey, apiUnauthorized } from '@/lib/api-auth';
import { checkApiLimit } from '@/lib/rate-limit';

// GET /api/v1/conversations?status=open&page=0&limit=20
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiUnauthorized();

  const rl = await checkApiLimit(auth.keyId);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const url    = request.nextUrl;
  const status = url.searchParams.get('status') ?? '';
  const page   = parseInt(url.searchParams.get('page') ?? '0', 10);
  const size   = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);

  const db = createAdminClient() as any;
  let q = db
    .from('conversations')
    .select(`
      id, status, channel, unread_count, last_message, last_message_at, created_at,
      contacts(id, name, phone, email, tags)
    `, { count: 'exact' })
    .eq('workspace_id', auth.workspaceId)
    .range(page * size, page * size + size - 1)
    .order('last_message_at', { ascending: false });

  if (status) q = q.eq('status', status);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data ?? [],
    meta: { total: count ?? 0, page, limit: size },
  });
}
