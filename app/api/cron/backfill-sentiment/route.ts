import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { callAI } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// One-time-ish sentiment backfill. Older/outage-window conversations have a NULL
// sentiment (the bot computes it live on inbound, so only new chats were covered).
// This fills those in on the funded provider keys, in batches, then naturally idles
// once none are left (new conversations keep getting sentiment live in the webhook).
// Scheduled by pg_cron every 20 minutes (migration 081); mirrors the reply-sweep cron.
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const deadline = Date.now() + 55_000;

  // Conversations with no sentiment yet — process oldest first, capped per run.
  const { data: convs } = await db
    .from('conversations')
    .select('id, workspace_id')
    .is('sentiment', null)
    .order('created_at', { ascending: true })
    .limit(120);

  let processed = 0, set = 0;
  for (const cv of (convs ?? []) as Array<{ id: string; workspace_id: string }>) {
    if (Date.now() > deadline) break;
    processed++;

    // Latest inbound customer message — nothing to analyse without one.
    const { data: msg } = await db
      .from('messages')
      .select('content')
      .eq('conversation_id', cv.id)
      .eq('workspace_id', cv.workspace_id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const text = (msg?.content ?? '').trim();
    if (!text) continue;

    const raw = await callAI(
      [
        { role: 'system', content: 'Classify the sentiment of this customer message. Reply with ONLY one word: positive, neutral, or negative.' },
        { role: 'user', content: text },
      ],
      { model: 'openai/gpt-4o-mini', maxTokens: 5, temperature: 0 },
    );
    const sentiment = raw && ['positive', 'neutral', 'negative'].includes(raw.toLowerCase().trim())
      ? raw.toLowerCase().trim()
      : null;
    if (sentiment) {
      await db.from('conversations').update({ sentiment }).eq('id', cv.id).eq('workspace_id', cv.workspace_id);
      set++;
    }
  }

  return NextResponse.json({ processed, set });
}

export async function POST(request: NextRequest) { return run(request); }
export async function GET(request: NextRequest) { return run(request); }
