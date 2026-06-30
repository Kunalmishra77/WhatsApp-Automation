import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';

async function getWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).single();
  return data?.workspace_id ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id } = await params;

  const { data: list, error } = await (supabase as any)
    .from('contact_lists')
    .select('id, name, source, description, color, created_at')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !list) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: members } = await (supabase as any)
    .from('contact_list_members')
    .select('contact:contacts!contact_id(id, name, phone, email, tags, created_at)')
    .eq('list_id', id)
    .order('added_at', { ascending: false });

  return NextResponse.json({
    list,
    contacts: (members ?? []).map((m: any) => m.contact),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const update: Record<string, string> = {};
  if (body.name)        update.name        = body.name.trim();
  if (body.description !== undefined) update.description = body.description;
  if (body.color)       update.color       = body.color;

  const { data, error } = await (supabase as any)
    .from('contact_lists')
    .update(update)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ list: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id } = await params;
  // Cascade delete handles contact_list_members automatically
  const { error } = await (supabase as any)
    .from('contact_lists')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
