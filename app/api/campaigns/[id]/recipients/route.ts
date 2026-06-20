import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { format } from 'date-fns';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const sp            = request.nextUrl.searchParams;
    const workspaceId   = sp.get('workspaceId');
    const status        = sp.get('status') ?? 'all';
    const page          = parseInt(sp.get('page') ?? '1', 10);
    const isExport      = sp.get('export') === '1';
    const repliedWithin = sp.get('replied_within');   // '1' | '3' | '24' hours
    const replyFilter   = sp.get('reply_filter');     // exact reply_text value
    const search        = sp.get('search') ?? '';
    const limit         = isExport ? 1000 : 50;  // paginated in chunks below for export
    const offset        = (page - 1) * limit;

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // ── Campaign + template info ──────────────────────────────────────────────
    const { data: campaign } = await db
      .from('campaigns')
      .select(`
        id, name, status, audience_type, audience_filter,
        total_recipients, sent_count, failed_count, delivered_count, read_count,
        scheduled_at, started_at, completed_at, created_at,
        media_id, media_type,
        templates(id, name, header_type, body, buttons)
      `)
      .eq('id', campaignId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    // ── Full stats via parallel count queries (bypass 1000-row default limit) ─
    // Model: sent (API accepted) + failed (API rejected) + filtered (pre-filtered) = total
    const [
      totalRes, sentRes, deliveredRes, readRes, repliedRes, failedRes, filteredRes,
      buttonRepliesRes, textRepliesRes,
    ] = await Promise.all([
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).in('status', ['sent', 'delivered', 'read', 'replied']),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).in('status', ['delivered', 'read', 'replied']),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).in('status', ['read', 'replied']),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'replied'),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'failed'),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'filtered'),
      // Breakdown of replied by reply_type — server-side so it's accurate across all pages
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'replied').eq('reply_type', 'button'),
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'replied').eq('reply_type', 'text'),
    ]);

    const total          = totalRes.count          ?? 0;
    const sent           = sentRes.count           ?? 0;
    const failed         = failedRes.count         ?? 0;
    const filtered       = filteredRes.count       ?? 0;
    const delivered      = deliveredRes.count      ?? 0;
    const read           = readRes.count           ?? 0;
    const replied        = repliedRes.count        ?? 0;
    const button_replies = buttonRepliesRes.count  ?? 0;
    const text_replies   = textRepliesRes.count    ?? 0;
    const stats = { total, sent, delivered, read, replied, failed, filtered, button_replies, text_replies };

    // ── Unique reply texts for dropdown ───────────────────────────────────────
    const { data: replyTextsRaw } = await db
      .from('campaign_recipients')
      .select('reply_text')
      .eq('campaign_id', campaignId)
      .eq('status', 'replied')
      .not('reply_text', 'is', null);

    const uniqueReplyTexts: string[] = [
      ...new Set(
        (replyTextsRaw ?? [])
          .map((r: { reply_text: string }) => r.reply_text)
          .filter(Boolean),
      ),
    ] as string[];

    // ── Recipients list ───────────────────────────────────────────────────────
    let query = db
      .from('campaign_recipients')
      .select(
        'id, phone, name, status, sent_at, delivered_at, read_at, replied_at, reply_type, reply_text, error_message, filtered_reason, conversation_id, contact_id',
        { count: 'exact' },
      )
      .eq('campaign_id', campaignId)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Status filter
    // sent = API-accepted contacts (status in sent/delivered/read/replied — all non-rejected)
    // failed = immediate API rejections only
    // filtered = pre-filtered contacts (no_whatsapp cache or repeat_campaign_fail)
    if (status === 'sent')           query = query.in('status', ['sent', 'delivered', 'read', 'replied']);
    else if (status === 'delivered') query = query.in('status', ['delivered', 'read', 'replied']);
    else if (status === 'read')      query = query.in('status', ['read', 'replied']);
    else if (status !== 'all')       query = query.eq('status', status);

    // Reply text filter (Replied tab dropdown)
    if (status === 'replied' && replyFilter) {
      query = query.eq('reply_text', replyFilter);
    }

    // Name / phone search
    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: recipientsRaw, count } = await query;

    // Replied-within filter (needs in-memory column comparison)
    let recipients = (recipientsRaw ?? []) as Array<Record<string, unknown>>;
    if (status === 'replied' && repliedWithin) {
      const hours = parseInt(repliedWithin, 10);
      recipients = recipients.filter((r) => {
        if (!r.replied_at || !r.sent_at) return false;
        const diffMs = new Date(r.replied_at as string).getTime() - new Date(r.sent_at as string).getTime();
        return diffMs <= hours * 60 * 60 * 1000;
      });
    }

    // ── Enrich missing names from contacts table ──────────────────────────────
    recipients = await enrichNames(db, workspaceId, recipients);

    // ── Export CSV — paginate to bypass Supabase 1000-row default limit ─────
    if (isExport) {
      let allRows: Array<Record<string, unknown>> = [];
      let exportOffset = 0;
      const CHUNK = 1000;
      while (true) {
        let q = db
          .from('campaign_recipients')
          .select('id, phone, name, status, sent_at, delivered_at, read_at, replied_at, reply_type, reply_text, error_message, filtered_reason, conversation_id, contact_id')
          .eq('campaign_id', campaignId)
          .order('sent_at', { ascending: false })
          .range(exportOffset, exportOffset + CHUNK - 1);
        if (status === 'sent')           q = q.in('status', ['sent', 'delivered', 'read', 'replied']);
        else if (status === 'delivered') q = q.in('status', ['delivered', 'read', 'replied']);
        else if (status === 'read')      q = q.in('status', ['read', 'replied']);
        else if (status !== 'all')       q = q.eq('status', status);
        if (status === 'replied' && replyFilter) q = q.eq('reply_text', replyFilter);
        if (search.trim()) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
        const { data: chunk } = await q;
        if (!chunk || chunk.length === 0) break;
        allRows = allRows.concat(chunk as Array<Record<string, unknown>>);
        if (chunk.length < CHUNK) break;
        exportOffset += CHUNK;
      }
      allRows = await enrichNames(db, workspaceId, allRows);
      const csv = buildCSV(status, allRows, campaign.name);
      return new NextResponse(csv, {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${campaign.name.replace(/[^a-z0-9]/gi, '_')}_${status}.csv"`,
        },
      });
    }

    return NextResponse.json({
      campaign,
      stats,
      unique_reply_texts: uniqueReplyTexts,
      recipients,
      total: repliedWithin ? recipients.length : (count ?? 0),
      page,
      pages: Math.ceil((repliedWithin ? recipients.length : (count ?? 0)) / limit),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Recipients]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Enrich campaign_recipients rows that have null names by looking up contacts by phone
async function enrichNames(
  db: any,
  workspaceId: string,
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const nullNamePhones = rows
    .filter((r) => !r.name)
    .map((r) => r.phone as string)
    .filter(Boolean);

  if (nullNamePhones.length === 0) return rows;

  // Batch lookup in contacts (max 400 per query to stay under URL limit)
  const phoneNameMap = new Map<string, string>();
  const BATCH = 400;
  for (let i = 0; i < nullNamePhones.length; i += BATCH) {
    const batch = nullNamePhones.slice(i, i + BATCH);
    const { data } = await db
      .from('contacts')
      .select('phone, name')
      .eq('workspace_id', workspaceId)
      .in('phone', batch) as { data: Array<{ phone: string; name: string }> | null };
    for (const c of data ?? []) {
      if (c.name) phoneNameMap.set(c.phone, c.name);
    }
  }

  if (phoneNameMap.size === 0) return rows;

  return rows.map((r) => ({
    ...r,
    name: r.name ?? phoneNameMap.get(r.phone as string) ?? null,
  }));
}

// ── CSV builder per tab ───────────────────────────────────────────────────────
function buildCSV(status: string, rows: Array<Record<string, unknown>>, campaignName: string): string {
  const bom  = '﻿';
  const fmt  = (v: unknown) => v ? format(new Date(v as string), 'yyyy-MM-dd HH:mm') : '';
  const diff = (a: unknown, b: unknown) => {
    if (!a || !b) return '';
    const ms = new Date(b as string).getTime() - new Date(a as string).getTime();
    if (ms < 0) return '';
    const m = Math.round(ms / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  let header: string[];
  let rowFn:  (r: Record<string, unknown>) => unknown[];

  switch (status) {
    case 'delivered':
      header = ['Name', 'Mobile', 'Sent At', 'Delivered At', 'Time to Deliver', 'Current Status'];
      rowFn  = (r) => [r.name, r.phone, fmt(r.sent_at), fmt(r.delivered_at), diff(r.sent_at, r.delivered_at), r.status];
      break;
    case 'read':
      header = ['Name', 'Mobile', 'Delivered At', 'Read At', 'Time to Read', 'Replied?'];
      rowFn  = (r) => [r.name, r.phone, fmt(r.delivered_at), fmt(r.read_at), diff(r.delivered_at, r.read_at), r.status === 'replied' ? 'Yes' : 'No'];
      break;
    case 'replied':
      header = ['Name', 'Mobile', 'Sent At', 'Delivered At', 'Read At', 'Replied At', 'Time to Reply', 'Reply Type', 'Reply Text'];
      rowFn  = (r) => [r.name, r.phone, fmt(r.sent_at), fmt(r.delivered_at), fmt(r.read_at), fmt(r.replied_at), diff(r.sent_at, r.replied_at), r.reply_type, r.reply_text];
      break;
    case 'failed':
      header = ['Name', 'Mobile', 'Sent At', 'Error Reason'];
      rowFn  = (r) => [r.name, r.phone, fmt(r.sent_at), r.error_message];
      break;
    case 'filtered':
      header = ['Name', 'Mobile', 'Filter Reason'];
      rowFn  = (r) => [r.name, r.phone, r.filtered_reason === 'no_whatsapp' ? 'Not on WhatsApp' : 'Failed in 2+ previous campaigns'];
      break;
    case 'all':
      header = ['Name', 'Mobile', 'Status', 'Sent At', 'Delivered At', 'Read At', 'Replied At', 'Reply Type', 'Reply Text', 'Error'];
      rowFn  = (r) => [r.name, r.phone, r.status, fmt(r.sent_at), fmt(r.delivered_at), fmt(r.read_at), fmt(r.replied_at), r.reply_type, r.reply_text, r.error_message];
      break;
    default: // sent
      header = ['Name', 'Mobile', 'Sent At', 'Delivered At', 'Current Status'];
      rowFn  = (r) => [r.name, r.phone, fmt(r.sent_at), fmt(r.delivered_at), r.status];
  }

  const lines = [
    header.map(cell).join(','),
    ...rows.map((r) => rowFn(r).map(cell).join(',')),
  ];
  return bom + lines.join('\n');
}
