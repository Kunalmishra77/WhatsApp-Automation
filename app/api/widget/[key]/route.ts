import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/widget/[key] — public: returns widget config for embed script
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = createAdminClient() as any;
  const { data: widget } = await db
    .from('chat_widgets')
    .select('phone_number,prefill_message,greeting_text,business_name,avatar_url,button_color,position,button_label,show_label')
    .eq('embed_key', key)
    .eq('is_active', true)
    .single();

  if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 });

  return NextResponse.json(widget, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// POST /api/widget/[key] — public: track a click
export async function POST(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = createAdminClient() as any;
  await db.rpc('increment_widget_clicks', { widget_key: key }).catch(() => {
    // Fallback if RPC not available
    db.from('chat_widgets')
      .select('id, total_clicks')
      .eq('embed_key', key)
      .single()
      .then(({ data }: any) => {
        if (data) {
          db.from('chat_widgets')
            .update({ total_clicks: (data.total_clicks ?? 0) + 1 })
            .eq('id', data.id);
        }
      });
  });
  return NextResponse.json({ ok: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });
}
