import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { title, message, target_plan } = await req.json() as { title: string; message: string; target_plan?: string };

  // Get target workspaces
  let wsQuery = db.from('workspaces').select('id, name, phone_number_id, access_token, owner_phone').eq('is_active', true).is('deleted_at', null);
  if (target_plan) wsQuery = wsQuery.eq('plan', target_plan);
  const { data: workspaces } = await wsQuery;

  let sent_count = 0;
  const full_message = `📢 *${title}*\n\n${message}\n\n— Agentix Team`;

  for (const ws of workspaces ?? []) {
    if (!ws.phone_number_id || !ws.access_token || !ws.owner_phone) continue;
    try {
      const token = (ws.access_token as string).replace(/﻿/g, '').trim();
      const res = await fetch(`https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: (ws.owner_phone as string).replace(/\D/g, ''),
          type: 'text',
          text: { body: full_message, preview_url: false },
        }),
      });
      if (res.ok) sent_count++;
    } catch { /* skip failed sends */ }
  }

  // Record announcement
  await db.from('admin_announcements').insert({ title, message, target_plan: target_plan ?? null, sent_at: new Date().toISOString(), created_by: user.id });

  return NextResponse.json({ success: true, sent_count });
}
