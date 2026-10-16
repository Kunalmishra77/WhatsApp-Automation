import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { logActivity } from '@/lib/activity-log';

// PATCH /api/contacts/[id]/owner
// Body: { workspaceId, ownerId: string | null }
//
// The client -> team half of the link. The team -> client half is the member
// profile's Clients list, which reads the same contacts.owner_id column, so the
// two views can never drift apart.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId, ownerId } = await request.json() as {
      workspaceId?: string; ownerId?: string | null;
    };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    const auth = await requireWorkspacePermission(workspaceId, 'manage_contacts');

    const db = createAdminClient() as any;

    // An owner must be a member of this workspace — otherwise a client could be
    // handed to someone outside the organisation.
    if (ownerId) {
      const { data: member } = await db
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', ownerId)
        .maybeSingle();
      if (!member) {
        return NextResponse.json({ error: 'That user is not a member of this workspace' }, { status: 400 });
      }
    }

    const { data: contact } = await db
      .from('contacts')
      .select('id, name, phone, owner_id')
      .eq('id', id).eq('workspace_id', workspaceId).maybeSingle();

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const { error } = await db
      .from('contacts')
      .update({ owner_id: ownerId ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(error.message);

    await logActivity({
      workspaceId, actorId: auth.userId,
      action: 'contact.owner_changed', entityType: 'contact',
      entityId: id,
      entityLabel: (contact.name as string | null) ?? (contact.phone as string | null),
      metadata: { from: contact.owner_id ?? null, to: ownerId ?? null },
    });

    return NextResponse.json({ success: true, ownerId: ownerId ?? null });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[ContactOwner PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
