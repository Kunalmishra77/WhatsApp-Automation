import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await (supabase as any).from('workspace_members').select('workspace_id').eq('user_id', user.id).single();
  const workspaceId: string | undefined = member?.workspace_id;
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: sourceListId } = await params;
  const { contactIds, targetListId } = await req.json() as { contactIds: string[]; targetListId: string };
  if (!contactIds?.length || !targetListId)
    return NextResponse.json({ error: 'contactIds and targetListId required' }, { status: 400 });

  // Verify both lists belong to workspace
  const { data: lists } = await (supabase as any)
    .from('contact_lists').select('id')
    .in('id', [sourceListId, targetListId])
    .eq('workspace_id', workspaceId);
  if ((lists ?? []).length < 2)
    return NextResponse.json({ error: 'One or both lists not found' }, { status: 404 });

  // Add to target
  const rows = contactIds.map((cid) => ({ list_id: targetListId, contact_id: cid }));
  await (supabase as any)
    .from('contact_list_members')
    .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true });

  // Remove from source
  await (supabase as any)
    .from('contact_list_members')
    .delete()
    .eq('list_id', sourceListId)
    .in('contact_id', contactIds);

  return NextResponse.json({ ok: true, moved: contactIds.length });
}
