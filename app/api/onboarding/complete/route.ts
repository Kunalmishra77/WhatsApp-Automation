import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId?: string;
      phone_number_id?: string;
      access_token?: string;
      waba_id?: string;
      app_secret?: string;
      industry?: string;
      business_phone?: string;
      selected_plan?: string;
    };

    const { workspaceId, phone_number_id, access_token,
            waba_id, app_secret, industry, business_phone, selected_plan } = body;

    if (!workspaceId || !phone_number_id || !access_token) {
      return NextResponse.json(
        { error: 'workspaceId, phone_number_id, and access_token are required' },
        { status: 400 },
      );
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;

    const update: Record<string, unknown> = {
      onboarding_complete: true,
      subscription_status: 'pending_approval',
      is_active:           false,
      phone_number_id,
      access_token,
      webhook_secret:      'agentix-webhook-secret-2026',
    };
    if (waba_id)        update.waba_id     = waba_id;
    if (industry)       update.industry    = industry;
    if (business_phone) update.owner_phone = business_phone;
    if (selected_plan)  update.plan        = selected_plan;
    if (app_secret)     update.settings    = { app_secret };

    const { error } = await db.from('workspaces').update(update).eq('id', workspaceId);

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
