import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

// GET /api/contacts/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('contacts')
      .select('*, contact_notes(id, content, created_at, created_by)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await requireWorkspacePermission(data.workspace_id as string, 'manage_contacts');
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/contacts/[id]
// Body: { name?, email?, tags?, notes?, is_blocked?, opted_out? }
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const db = createAdminClient() as any;

    // Fetch workspace_id first for permission check
    const { data: existing, error: fetchErr } = await db
      .from('contacts')
      .select('workspace_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await requireWorkspacePermission(existing.workspace_id as string, 'manage_contacts');

    // Only allow safe fields to be updated
    const allowed: Record<string, unknown> = {};
    const safeFields = ['name', 'email', 'tags', 'notes', 'is_blocked', 'opted_out', 'avatar_url'];
    for (const field of safeFields) {
      if (field in body) allowed[field] = body[field];
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await db
      .from('contacts')
      .update(allowed)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/contacts/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;

    const { data: existing, error: fetchErr } = await db
      .from('contacts')
      .select('workspace_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await requireWorkspacePermission(existing.workspace_id as string, 'manage_contacts');

    const { error } = await db.from('contacts').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
