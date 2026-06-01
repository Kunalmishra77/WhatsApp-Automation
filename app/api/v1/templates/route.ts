import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { validateApiKey, apiUnauthorized } from '@/lib/api-auth';
import { checkApiLimit } from '@/lib/rate-limit';

// GET /api/v1/templates?status=approved
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiUnauthorized();

  const rl = await checkApiLimit(auth.keyId);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const status = request.nextUrl.searchParams.get('status') ?? '';
  const db = createAdminClient() as any;

  let q = db
    .from('templates')
    .select('id, name, category, language, status, body, header_content, footer, buttons, variables')
    .eq('workspace_id', auth.workspaceId)
    .order('name');

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
