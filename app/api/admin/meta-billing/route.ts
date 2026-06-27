import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  return profile?.is_platform_admin ? db : null;
}

// GET — list all snapshots (latest per workspace)
export async function GET(_req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';

  const { data: snapshots, error } = await db
    .from('meta_billing_snapshots')
    .select(`
      id, workspace_id, waba_id, month,
      marketing_count, utility_count, auth_count, service_count,
      total_inr, fetched_at,
      workspaces(name, phone_number_id, is_active, subscription_status)
    `)
    .eq('month', currentMonth)
    .order('total_inr', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: snapshots ?? [] });
}

// POST — sync a specific workspace's Meta billing data
export async function POST(req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    workspace_id: string;
    marketing_count: number;
    utility_count: number;
    auth_count: number;
    service_count: number;
  };

  const { workspace_id, marketing_count, utility_count, auth_count, service_count } = body;

  // Meta pricing (INR)
  const RATES = { marketing: 0.58, utility: 0.14, auth: 0.14, service: 0.29 };
  const total_inr = +(
    marketing_count * RATES.marketing +
    utility_count   * RATES.utility   +
    auth_count      * RATES.auth      +
    service_count   * RATES.service
  ).toFixed(2);

  const { data: ws } = await db.from('workspaces').select('waba_id').eq('id', workspace_id).single();
  if (!ws?.waba_id) return NextResponse.json({ error: 'WABA ID not configured' }, { status: 400 });

  const month = new Date().toISOString().slice(0, 7) + '-01';

  const { error } = await db.from('meta_billing_snapshots').upsert({
    workspace_id,
    waba_id: ws.waba_id,
    month,
    marketing_count,
    utility_count,
    auth_count,
    service_count,
    total_inr,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,month' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, total_inr });
}
