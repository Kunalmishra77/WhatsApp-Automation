import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// GET /api/contacts/[id]/journey
// The cross-channel touchpoint timeline for a contact (Contact 360 → Journey).
// Workspace-scoped; permission derived from the contact's own workspace.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;

    const { data: contact, error: cErr } = await db
      .from('contacts')
      .select('id, workspace_id, channel, source_detail, first_touch_channel, first_touch_at, last_touch_channel, last_touch_at')
      .eq('id', id)
      .single();

    if (cErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await requireWorkspacePermission(contact.workspace_id as string, 'manage_contacts');

    const { data: touchpoints, error: tErr } = await db
      .from('marketing_touchpoints')
      .select('id, channel, source_detail, ref_type, ref_id, occurred_at, metadata')
      .eq('workspace_id', contact.workspace_id)
      .eq('contact_id', id)
      .order('occurred_at', { ascending: true });

    if (tErr) {
      console.error('[ContactJourney GET]', tErr);
      return NextResponse.json({ error: 'Failed to fetch journey' }, { status: 500 });
    }

    return NextResponse.json({
      contact: {
        id: contact.id,
        channel: contact.channel,
        source_detail: contact.source_detail,
        first_touch_channel: contact.first_touch_channel,
        first_touch_at: contact.first_touch_at,
        last_touch_channel: contact.last_touch_channel,
        last_touch_at: contact.last_touch_at,
      },
      touchpoints: touchpoints ?? [],
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[ContactJourney GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
