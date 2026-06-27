import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: workspaceId } = await params;

  const [{ data: ws }, { data: snapshots }] = await Promise.all([
    db.from('workspaces').select('id, name, waba_id, phone_number_id, access_token, is_active, subscription_status, plan').eq('id', workspaceId).single(),
    db.from('meta_billing_snapshots').select('*').eq('workspace_id', workspaceId).order('month', { ascending: false }).limit(6),
  ]);

  if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  // Fetch live phone status from Meta if token available
  let phoneStatus: Record<string, unknown> | null = null;
  if (ws.access_token && ws.phone_number_id) {
    try {
      const token = ws.access_token.replace(/﻿/g, '').trim();
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${ws.phone_number_id}?fields=id,quality_rating,status,account_mode,display_phone_number&access_token=${token}`
      );
      if (res.ok) phoneStatus = await res.json() as Record<string, unknown>;
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ workspace: ws, snapshots: snapshots ?? [], phoneStatus });
}
