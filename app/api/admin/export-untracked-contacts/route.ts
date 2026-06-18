import { NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/admin/export-untracked-contacts
// Returns CSV of the 2007 backfilled contacts in PB_VMS_3 that have no
// whatsapp_msg_id (no accurate delivery/read tracking).
// DELETE THIS FILE after use.
export async function GET() {
  const CAMPAIGN_ID = '0cd049a9-8286-4a4e-ab16-9bbb6a30c80d';
  const db = createAdminClient() as any;

  // Fetch campaign_recipients with no whatsapp_msg_id = backfilled rows with no tracking
  const rows: Array<{ phone: string; name: string; status: string; sent_at: string }> = [];
  let offset = 0;
  while (true) {
    const { data: page } = await db
      .from('campaign_recipients')
      .select('phone, name, status, sent_at')
      .eq('campaign_id', CAMPAIGN_ID)
      .is('whatsapp_msg_id', null)
      .range(offset, offset + 999);
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }

  // Build CSV
  const lines = [
    'phone,name,status,sent_at',
    ...rows.map((r) =>
      `${r.phone},"${(r.name ?? '').replace(/"/g, '""')}",${r.status},${r.sent_at ?? ''}`,
    ),
  ];
  const csv = lines.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="PB_VMS_3_no_tracking_${rows.length}_contacts.csv"`,
    },
  });
}
