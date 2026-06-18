import { NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// One-time backfill: inserts missing campaign_recipients rows for PB_VMS_3
// Safe to call multiple times — only inserts contacts NOT already tracked
// DELETE THIS FILE after use
export async function GET() {
  const CAMPAIGN_ID = '0cd049a9-8286-4a4e-ab16-9bbb6a30c80d';
  const db = createAdminClient() as any;

  // Get workspace_id
  const { data: campaign } = await db
    .from('campaigns')
    .select('workspace_id, name')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Find contacts NOT yet in campaign_recipients for this campaign
  const { data: alreadyTracked } = await db
    .from('campaign_recipients')
    .select('phone')
    .eq('campaign_id', CAMPAIGN_ID);

  const trackedPhones = new Set((alreadyTracked ?? []).map((r: { phone: string }) => r.phone));

  // Paginate all contacts in workspace
  const CONTACT_PAGE = 1000;
  let offset = 0;
  const missing: Array<Record<string, unknown>> = [];

  while (true) {
    const { data: page } = await db
      .from('contacts')
      .select('id, phone, name, workspace_id')
      .eq('workspace_id', campaign.workspace_id)
      .range(offset, offset + CONTACT_PAGE - 1);

    if (!page || page.length === 0) break;

    for (const c of page) {
      if (!trackedPhones.has(c.phone)) {
        missing.push({
          campaign_id:  CAMPAIGN_ID,
          workspace_id: campaign.workspace_id,
          contact_id:   c.id,
          phone:        c.phone,
          name:         c.name ?? null,
          status:       'sent',
          sent_at:      '2026-06-18T19:54:00+00:00',
        });
      }
    }

    if (page.length < CONTACT_PAGE) break;
    offset += CONTACT_PAGE;
  }

  // Insert in batches of 100
  let inserted = 0;
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const { error } = await db.from('campaign_recipients').insert(batch);
    if (error) return NextResponse.json({ error: error.message, inserted, remaining: missing.length - i }, { status: 500 });
    inserted += batch.length;
  }

  // Update campaign totals
  const { data: finalCount } = await db
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', CAMPAIGN_ID);

  const total = (finalCount as any)?.length ?? (alreadyTracked?.length ?? 0) + inserted;

  await db.from('campaigns').update({
    total_recipients: (alreadyTracked?.length ?? 0) + inserted,
    sent_count:       (alreadyTracked?.length ?? 0) + inserted,
    status:           'completed',
  }).eq('id', CAMPAIGN_ID);

  return NextResponse.json({
    ok: true,
    campaign: campaign.name,
    previously_tracked: alreadyTracked?.length ?? 0,
    newly_inserted: inserted,
    total_now: (alreadyTracked?.length ?? 0) + inserted,
  });
}
