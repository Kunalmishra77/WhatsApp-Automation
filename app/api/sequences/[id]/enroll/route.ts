import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sequenceId } = await params;
    const body = await request.json() as { contactId?: string };

    if (!body.contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const db = supabase as any;

    // Fetch sequence to get steps + workspace_id
    const { data: sequence, error: seqError } = await db
      .from('follow_up_sequences')
      .select('id, workspace_id, steps, is_active')
      .eq('id', sequenceId)
      .single();

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    await requireWorkspacePermission(sequence.workspace_id, 'manage_contacts');

    if (!sequence.is_active) {
      return NextResponse.json({ error: 'Sequence is not active' }, { status: 400 });
    }

    const steps = (sequence.steps ?? []) as Array<{ delay_hours: number; message: string }>;
    if (steps.length === 0) {
      return NextResponse.json({ error: 'Sequence has no steps' }, { status: 400 });
    }

    // Prevent duplicate enrollment — one active enrollment per contact per sequence
    const { data: existing } = await db
      .from('contact_sequences')
      .select('id')
      .eq('sequence_id', sequenceId)
      .eq('contact_id', body.contactId)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Contact is already enrolled in this sequence' }, { status: 409 });
    }

    const firstStep = steps[0];
    const firstDelayMs = (firstStep?.delay_hours ?? 24) * 60 * 60 * 1000;
    const nextSendAt = new Date(Date.now() + firstDelayMs).toISOString();

    const { data, error } = await db
      .from('contact_sequences')
      .insert({
        sequence_id:  sequenceId,
        workspace_id: sequence.workspace_id,
        contact_id:   body.contactId,
        current_step: 0,
        next_send_at: nextSendAt,
        status:       'active',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ enrollment: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Sequences Enroll]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
