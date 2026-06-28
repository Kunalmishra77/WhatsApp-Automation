import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

const RATES = { marketing: 0.58, utility: 0.14, auth: 0.14, service: 0.29 };

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  return profile?.is_platform_admin ? db : null;
}

// Fetch conversation analytics from Meta Graph API for a phone number
async function fetchMetaConversationAnalytics(
  phoneNumberId: string,
  accessToken: string,
  startDate: Date,
  endDate: Date,
): Promise<{ marketing: number; utility: number; auth: number; service: number } | null> {
  try {
    const token = accessToken.replace(/﻿/g, '').trim();
    const start = Math.floor(startDate.getTime() / 1000);
    const end   = Math.floor(endDate.getTime() / 1000);

    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/conversation_analytics` +
      `?start=${start}&end=${end}&granularity=MONTHLY` +
      `&conversation_types=["REGULAR"]` +
      `&dimensions=["conversation_type","conversation_direction"]` +
      `&access_token=${token}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json() as { error?: { message: string } };
      console.warn('[MetaBilling] Analytics API error:', err?.error?.message);
      return null;
    }

    const data = await res.json() as {
      data?: Array<{
        conversation_analytics?: {
          data?: Array<{
            conversation_type?: string;
            conversation_direction?: string;
            conversation?: number;
            cost?: number;
          }>;
        };
      }>;
    };

    const rows = data?.data?.[0]?.conversation_analytics?.data ?? [];
    let marketing = 0, utility = 0, auth = 0, service = 0;

    for (const row of rows) {
      const count = row.conversation ?? 0;
      const type  = (row.conversation_type ?? '').toUpperCase();
      if (type === 'MARKETING') marketing += count;
      else if (type === 'UTILITY')  utility  += count;
      else if (type === 'AUTHENTICATION') auth += count;
      else service += count; // SERVICE / REFERRAL / etc.
    }

    return { marketing, utility, auth, service };
  } catch (e) {
    console.warn('[MetaBilling] Fetch failed:', e);
    return null;
  }
}

// GET — list all snapshots + trigger auto-sync for all workspaces
export async function GET(req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const autoSync = req.nextUrl.searchParams.get('sync') === '1';
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';

  // If sync=1 → fetch from Meta API for all workspaces with credentials
  if (autoSync) {
    const { data: workspaces } = await db
      .from('workspaces')
      .select('id, name, waba_id, phone_number_id, access_token')
      .not('waba_id', 'is', null)
      .not('phone_number_id', 'is', null)
      .not('access_token', 'is', null)
      .eq('is_active', true);

    const now     = new Date();
    const start   = new Date(now.getFullYear(), now.getMonth(), 1); // first of this month
    const end     = now;
    let synced = 0;

    for (const ws of workspaces ?? []) {
      const analytics = await fetchMetaConversationAnalytics(
        ws.phone_number_id, ws.access_token, start, end,
      );

      if (!analytics) continue;

      const total_inr = +(
        analytics.marketing * RATES.marketing +
        analytics.utility   * RATES.utility   +
        analytics.auth      * RATES.auth      +
        analytics.service   * RATES.service
      ).toFixed(2);

      await db.from('meta_billing_snapshots').upsert({
        workspace_id:     ws.id,
        waba_id:          ws.waba_id,
        month:            currentMonth,
        marketing_count:  analytics.marketing,
        utility_count:    analytics.utility,
        auth_count:       analytics.auth,
        service_count:    analytics.service,
        total_inr,
        fetched_at:       new Date().toISOString(),
      }, { onConflict: 'workspace_id,month' });

      synced++;
    }

    console.log(`[MetaBilling] Auto-synced ${synced} workspaces`);
  }

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
  return NextResponse.json({ snapshots: snapshots ?? [], synced_at: new Date().toISOString() });
}

// POST — manual upsert (for manual entry or per-workspace sync)
export async function POST(req: NextRequest) {
  const db = await checkAdmin();
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    workspace_id: string;
    // If counts not provided → try to fetch from Meta API
    marketing_count?: number;
    utility_count?: number;
    auth_count?: number;
    service_count?: number;
  };

  const { workspace_id } = body;
  const { data: ws } = await db
    .from('workspaces')
    .select('waba_id, phone_number_id, access_token')
    .eq('id', workspace_id)
    .single();

  if (!ws?.waba_id) return NextResponse.json({ error: 'WABA ID not configured for this workspace' }, { status: 400 });

  let marketing = body.marketing_count ?? 0;
  let utility   = body.utility_count   ?? 0;
  let auth      = body.auth_count      ?? 0;
  let service   = body.service_count   ?? 0;
  let fromMeta  = false;

  // If no manual counts provided → fetch from Meta API
  if (body.marketing_count === undefined && ws.phone_number_id && ws.access_token) {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const analytics = await fetchMetaConversationAnalytics(ws.phone_number_id, ws.access_token, start, now);
    if (analytics) {
      marketing = analytics.marketing;
      utility   = analytics.utility;
      auth      = analytics.auth;
      service   = analytics.service;
      fromMeta  = true;
    }
  }

  const total_inr = +(
    marketing * RATES.marketing +
    utility   * RATES.utility   +
    auth      * RATES.auth      +
    service   * RATES.service
  ).toFixed(2);

  const month = new Date().toISOString().slice(0, 7) + '-01';

  const { error } = await db.from('meta_billing_snapshots').upsert({
    workspace_id,
    waba_id: ws.waba_id,
    month,
    marketing_count: marketing,
    utility_count:   utility,
    auth_count:      auth,
    service_count:   service,
    total_inr,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,month' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, total_inr, from_meta_api: fromMeta });
}
