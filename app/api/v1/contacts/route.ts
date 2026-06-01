import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { validateApiKey, apiUnauthorized } from '@/lib/api-auth';
import { checkApiLimit } from '@/lib/rate-limit';

// GET /api/v1/contacts?page=0&limit=50&search=&tag=
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiUnauthorized();

  const limit = await checkApiLimit(auth.keyId);
  if (!limit.success) return NextResponse.json({ error: 'Rate limit exceeded', retry_after: limit.reset }, { status: 429 });

  const url    = request.nextUrl;
  const page   = parseInt(url.searchParams.get('page') ?? '0', 10);
  const size   = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const search = url.searchParams.get('search') ?? '';
  const tag    = url.searchParams.get('tag') ?? '';

  const db = createAdminClient() as any;
  let q = db
    .from('contacts')
    .select('id, name, phone, email, tags, language, opted_out, created_at', { count: 'exact' })
    .eq('workspace_id', auth.workspaceId)
    .eq('is_blocked', false)
    .range(page * size, page * size + size - 1)
    .order('created_at', { ascending: false });

  if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  if (tag)    q = q.contains('tags', [tag]);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data:  data ?? [],
    meta:  { total: count ?? 0, page, limit: size, pages: Math.ceil((count ?? 0) / size) },
  });
}

// POST /api/v1/contacts — create/upsert
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiUnauthorized();

  const limit = await checkApiLimit(auth.keyId);
  if (!limit.success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const body = await request.json() as {
    phone?: string; name?: string; email?: string; tags?: string[];
  };

  if (!body.phone?.trim()) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

  const db = createAdminClient() as any;
  const { data, error } = await db
    .from('contacts')
    .upsert({
      workspace_id: auth.workspaceId,
      phone: body.phone.trim(),
      name:  body.name?.trim() ?? null,
      email: body.email?.trim() ?? null,
      tags:  body.tags ?? [],
    }, { onConflict: 'workspace_id,phone' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
