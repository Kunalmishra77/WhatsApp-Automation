import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/onboarding/complete
// Body: { workspaceId, phone_number_id, access_token, waba_id?, industry? }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, phone_number_id, access_token, waba_id, industry } = await request.json() as {
      workspaceId?: string;
      phone_number_id?: string;
      access_token?: string;
      waba_id?: string;
      industry?: string;
    };

    if (!workspaceId || !phone_number_id || !access_token) {
      return NextResponse.json(
        { error: 'workspaceId, phone_number_id, and access_token are required' },
        { status: 400 },
      );
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { error } = await db
      .from('workspaces')
      .update({
        onboarding_complete: true,
        subscription_status: 'pending_approval',
        is_active: false,
        phone_number_id,
        access_token,
        ...(waba_id   ? { waba_id }   : {}),
        ...(industry  ? { industry }  : {}),
      })
      .eq('id', workspaceId);

    if (error) {
      console.error('[onboarding/complete] DB error:', error);
      return NextResponse.json({ error: 'Failed to save workspace settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[onboarding/complete]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
