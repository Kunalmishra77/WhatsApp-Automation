import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { paginateAll, streamingCsvResponse } from '@/lib/export-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Recipient {
  name: string | null; phone: string | null; status: string | null;
  sent_at: string | null; delivered_at: string | null; read_at: string | null;
  replied_at: string | null; reply_text: string | null; error_message: string | null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: campaign } = await db
      .from('campaigns').select('workspace_id, name').eq('id', id).single();
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    await requireWorkspacePermission(campaign.workspace_id, 'create_campaigns');

    await db.from('campaigns').update({ data_exported_at: new Date().toISOString() }).eq('id', id);

    const headers = ['Name', 'Phone', 'Status', 'Sent At', 'Delivered At', 'Read At', 'Replied At', 'Reply', 'Error'];
    const pages = paginateAll<Recipient>((offset, pageSize) =>
      db.from('campaign_recipients')
        .select('name, phone, status, sent_at, delivered_at, read_at, replied_at, reply_text, error_message')
        .eq('campaign_id', id)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    );
    const safeName = String(campaign.name ?? 'campaign').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const dateTag = new Date().toISOString().slice(0, 10);
    return streamingCsvResponse<Recipient>(
      headers, pages,
      (r) => [r.name, r.phone, r.status, r.sent_at, r.delivered_at, r.read_at, r.replied_at, r.reply_text, r.error_message],
      `campaign_${safeName}_${dateTag}`,
    );
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[CampaignRetention export]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
