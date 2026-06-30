import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';

async function getWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).single();
  return data?.workspace_id ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: listId } = await params;
  const { contactIds } = await req.json() as { contactIds: string[] };
  if (!Array.isArray(contactIds) || contactIds.length === 0)
    return NextResponse.json({ error: 'contactIds required' }, { status: 400 });

  // Verify list belongs to workspace
  const { data: list } = await (supabase as any)
    .from('contact_lists').select('id').eq('id', listId).eq('workspace_id', workspaceId).single();
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

  const rows = contactIds.map((cid) => ({ list_id: listId, contact_id: cid }));
  const { error } = await (supabase as any)
    .from('contact_list_members')
    .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, added: contactIds.length });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: listId } = await params;
  const { contactIds } = await req.json() as { contactIds: string[] };
  if (!Array.isArray(contactIds) || contactIds.length === 0)
    return NextResponse.json({ error: 'contactIds required' }, { status: 400 });

  const { error } = await (supabase as any)
    .from('contact_list_members')
    .delete()
    .eq('list_id', listId)
    .in('contact_id', contactIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
