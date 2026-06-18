import { NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/admin/export-untracked-contacts
// Returns CSV of contacts in VMS workspace NOT tracked in PB_VMS_3's campaign_recipients.
// Use this to create a new campaign for only the 2007 untracked contacts.
// DELETE THIS FILE after use.
export async function GET() {
  const CAMPAIGN_ID = '0cd049a9-8286-4a4e-ab16-9bbb6a30c80d';
  const db = createAdminClient() as any;

  const { data: campaign } = await db
    .from('campaigns')
    .select('workspace_id, name')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Get all already-tracked phones for this campaign (paginated)
  const trackedPhones = new Set<string>();
  let offset = 0;
  while (true) {
    const { data: page } = await db
      .from('campaign_recipients')
      .select('phone')
      .eq('campaign_id', CAMPAIGN_ID)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    page.forEach((r: { phone: string }) => trackedPhones.add(r.phone));
    if (page.length < 1000) break;
    offset += 1000;
  }

  // Get all contacts in workspace (paginated) — exclude tracked ones
  const untracked: Array<{ phone: string; name: string }> = [];
  offset = 0;
  while (true) {
    const { data: page } = await db
      .from('contacts')
      .select('phone, name')
      .eq('workspace_id', campaign.workspace_id)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    for (const c of page) {
      if (!trackedPhones.has(c.phone)) {
        untracked.push({ phone: c.phone, name: c.name ?? '' });
      }
    }
    if (page.length < 1000) break;
    offset += 1000;
  }

  // Build CSV
  const lines = ['phone,name', ...untracked.map((c) => `${c.phone},"${(c.name ?? '').replace(/"/g, '""')}"`)];
  const csv = lines.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="vms_untracked_${untracked.length}_contacts.csv"`,
    },
  });
}
