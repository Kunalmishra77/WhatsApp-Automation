import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { getRequiredSecret } from '@/lib/supabase-env';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IgMessage {
  mid: string;
  text?: string;
  attachments?: Array<{ type: string; payload: { url: string } }>;
}

interface IgMessaging {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?:  IgMessage;
}

interface IgEntry {
  id:        string;
  time:      number;
  messaging?: IgMessaging[];
}

interface IgPayload {
  object: string;
  entry:  IgEntry[];
}

// ─── GET — webhook verification ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === getRequiredSecret('WHATSAPP_WEBHOOK_SECRET')) {
    console.log('[IG Webhook] Verified by Meta');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─── POST — incoming DMs ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let payload: IgPayload;
  try {
    payload = await request.json() as IgPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.object !== 'instagram') {
    return NextResponse.json({ status: 'ignored' });
  }

  const db = createAdminClient() as any;

  for (const entry of payload.entry ?? []) {
    const igAccountId = entry.id; // Instagram Business Account ID

    // Find workspace by ig_user_id
    const { data: igAccount } = await db
      .from('instagram_accounts')
      .select('workspace_id, access_token, ig_user_id, username')
      .eq('ig_user_id', igAccountId)
      .single();

    if (!igAccount) {
      console.warn('[IG Webhook] No instagram_account for ig_user_id:', igAccountId);
      continue;
    }

    for (const ev of entry.messaging ?? []) {
      if (!ev.message) continue;

      // Ignore echo (messages sent by the page itself)
      if (ev.sender.id === igAccountId) continue;

      await handleIncomingDM(db, igAccount, ev).catch((err) => {
        console.error('[IG Webhook] handleIncomingDM error:', err);
      });
    }
  }

  return NextResponse.json({ status: 'ok' });
}

// ─── Handle incoming DM ───────────────────────────────────────────────────────

async function handleIncomingDM(
  db: any,
  igAccount: { workspace_id: string; access_token: string; ig_user_id: string; username: string },
  ev: IgMessaging,
) {
  const { workspace_id: workspaceId, access_token: accessToken, ig_user_id: igUserId } = igAccount;
  const senderIgsid = ev.sender.id;
  const igPhone = `ig:${senderIgsid}`; // pseudo-phone to uniquely identify Instagram contacts

  // ── Fetch sender profile from Instagram ────────────────────────────────────
  let senderName: string | null = null;
  try {
    const profileRes = await fetch(
      `https://graph.facebook.com/v19.0/${senderIgsid}?fields=name,username,profile_pic&access_token=${accessToken}`,
    );
    if (profileRes.ok) {
      const profile = await profileRes.json() as { name?: string; username?: string };
      senderName = profile.name ?? profile.username ?? null;
    }
  } catch {
    // Profile fetch is best-effort
  }

  // ── Upsert contact ────────────────────────────────────────────────────────
  await db
    .from('contacts')
    .upsert(
      { workspace_id: workspaceId, phone: igPhone, name: senderName },
      { onConflict: 'workspace_id,phone', ignoreDuplicates: false },
    );

  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('phone', igPhone)
    .single();

  if (!contact) throw new Error('Failed to upsert Instagram contact');

  // ── Upsert conversation ──────────────────────────────────────────────────
  const { data: conversation } = await db
    .from('conversations')
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id:   contact.id,
        status:       'open',
        channel:      'instagram',
        last_message_at: new Date(ev.timestamp).toISOString(),
        meta: { ig_sender_id: senderIgsid, ig_account_id: igUserId },
      },
      { onConflict: 'workspace_id,contact_id', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (!conversation) throw new Error('Failed to upsert Instagram conversation');

  // ── Build message content ─────────────────────────────────────────────────
  const text = ev.message?.text ?? '';
  const attachment = ev.message?.attachments?.[0];
  const msgType = attachment ? (attachment.type === 'image' ? 'image' : 'file') : 'text';
  const content = text || (attachment ? `[${attachment.type}]` : '');

  // ── Insert message (deduplicate by ig mid) ────────────────────────────────
  const { error: msgError } = await db.from('messages').insert({
    conversation_id: conversation.id,
    workspace_id:    workspaceId,
    whatsapp_msg_id: ev.message!.mid, // reuse column for ig mid
    sender_type:     'contact',
    sender_id:       contact.id,
    direction:       'inbound',
    type:            msgType,
    content,
    status:          'delivered',
    media_url:       attachment?.payload?.url ?? null,
    metadata:        { instagram: ev, ig_sender_id: senderIgsid },
    created_at:      new Date(ev.timestamp).toISOString(),
  });

  if (msgError?.code === '23505') {
    console.log('[IG Webhook] Duplicate message ignored:', ev.message!.mid);
    return;
  }

  if (msgError) throw new Error(msgError.message);

  // ── Update conversation last_message ─────────────────────────────────────
  await db
    .from('conversations')
    .update({
      last_message: content.slice(0, 200),
      last_message_at: new Date(ev.timestamp).toISOString(),
      unread_count: db.raw ? db.raw('unread_count + 1') : undefined,
    })
    .eq('id', conversation.id);

  // ── Track usage (non-blocking) ───────────────────────────────────────────
  void import('@/lib/usage-tracker').then(({ trackMessageIn }) => trackMessageIn(workspaceId)).catch(() => {});
}
