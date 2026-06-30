import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';

async function getWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).single();
  return data?.workspace_id ?? null;
}

// GET /api/meta-prefill — list all registered pre-fill texts for workspace
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data } = await (supabase as any)
    .from('meta_ad_prefill_messages')
    .select('id, text, template_name, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ prefills: data ?? [] });
}

// POST /api/meta-prefill — register a new pre-fill text
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { text, template_name } = await req.json() as { text?: string; template_name?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  const { data, error } = await (supabase as any)
    .from('meta_ad_prefill_messages')
    .insert({ workspace_id: workspaceId, text: text.trim(), template_name: template_name?.trim() ?? null })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'This pre-fill text is already registered' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ prefill: data }, { status: 201 });
}
