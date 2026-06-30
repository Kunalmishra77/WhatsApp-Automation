import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';

async function getWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('workspace_id').eq('id', userId).single();
  return data?.workspace_id ?? null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  // Fetch all lists with contact count via a join
  const { data: lists, error } = await (supabase as any)
    .from('contact_lists')
    .select(`
      id, name, source, description, color, created_at, updated_at,
      contact_list_members(count)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (lists ?? []).map((l: any) => ({
    ...l,
    contact_count: l.contact_list_members?.[0]?.count ?? 0,
    contact_list_members: undefined,
  }));

  return NextResponse.json({ lists: result });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const body = await req.json();
  const { name, source = 'manual', description = '', color = 'gray' } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { data, error } = await (supabase as any)
    .from('contact_lists')
    .insert({ workspace_id: workspaceId, name: name.trim(), source, description, color, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ list: data }, { status: 201 });
}
