import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';

const BUY_SIGNAL_KEYWORDS = [
  'price', 'cost', 'how much', 'kitna', 'rate', 'charge',
  'buy', 'purchase', 'order', 'book', 'kharidna',
  'interested', 'want', 'need', 'chahiye',
  'delivery', 'ship', 'dispatch',
  'when', 'available', 'stock',
  'discount', 'offer', 'deal',
];

// POST /api/ai/revenue/analyze
// Body: { workspaceId }
// Analyzes up to 50 most recently active contacts and upserts contact_insights.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;

    // Fetch up to 50 contacts with recent conversations
    const { data: contacts, error: contactsError } = await db
      .from('contacts')
      .select('id, name, phone')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (contactsError) throw new Error(contactsError.message);
    if (!contacts?.length) return NextResponse.json({ analyzed: 0 });

    let analyzed = 0;

    for (const contact of contacts as Array<{ id: string; name: string | null; phone: string }>) {
      // Fetch last 20 messages for this contact's conversations
      const { data: convRow } = await db
        .from('conversations')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .single();

      if (!convRow) continue;

      const { data: msgs } = await db
        .from('messages')
        .select('direction, content, created_at')
        .eq('conversation_id', convRow.id)
        .eq('type', 'text')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!msgs?.length) continue;

      const messages = msgs as Array<{ direction: string; content: string | null; created_at: string }>;

      // ── Best send hour — statistical (hour contact sends most inbound msgs) ─
      const inboundHours = messages
        .filter((m) => m.direction === 'inbound')
        .map((m) => new Date(m.created_at).getUTCHours());
      const hourCounts = Array(24).fill(0) as number[];
      for (const h of inboundHours) { const c = hourCounts[h]; if (c !== undefined) hourCounts[h] = c + 1; }
      const bestSendHour = inboundHours.length
        ? hourCounts.indexOf(Math.max(...hourCounts))
        : null;

      // ── Quick keyword signal score (no AI token cost) ───────────────────────
      const combinedText = messages
        .filter((m) => m.direction === 'inbound')
        .map((m) => (m.content ?? '').toLowerCase())
        .join(' ');

      const foundSignals = BUY_SIGNAL_KEYWORDS.filter((kw) => combinedText.includes(kw));
      const keywordScore = Math.min(foundSignals.length * 15, 60);

      // ── AI scoring on conversation excerpt ───────────────────────────────────
      const excerpt = messages
        .slice(0, 10)
        .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content ?? ''}`)
        .join('\n');

      let leadScore = keywordScore;
      let hotLead = false;
      let buySig = foundSignals.slice(0, 3);
      let summary = '';

      try {
        const aiResult = await callAI(
          [
            {
              role: 'system',
              content: `You are a sales intelligence AI analyzing WhatsApp customer conversations.
Return ONLY valid JSON with these fields:
{
  "lead_score": <integer 0-100>,
  "hot_lead": <boolean>,
  "buy_signals": <string[] max 3, short phrases>,
  "insights_summary": <string, 1 sentence max 120 chars>
}
Scoring guide: 0-30=cold, 31-60=warm, 61-80=hot, 81-100=very hot.
Hot lead = score>=65 OR explicit purchase intent detected.`,
            },
            {
              role: 'user',
              content: `Customer: ${contact.name ?? contact.phone}\nConversation:\n${excerpt}`,
            },
          ],
          { maxTokens: 200, temperature: 0.2, jsonMode: true },
        );

        if (aiResult) {
          const parsed = JSON.parse(aiResult) as {
            lead_score?: number;
            hot_lead?: boolean;
            buy_signals?: string[];
            insights_summary?: string;
          };
          leadScore  = typeof parsed.lead_score === 'number' ? Math.min(100, Math.max(0, parsed.lead_score)) : keywordScore;
          hotLead    = parsed.hot_lead ?? leadScore >= 65;
          buySig     = parsed.buy_signals ?? buySig;
          summary    = parsed.insights_summary ?? '';
        }
      } catch {
        // AI failed — fall back to keyword score
        hotLead = leadScore >= 65;
      }

      await db.from('contact_insights').upsert(
        {
          contact_id:       contact.id,
          workspace_id:     workspaceId,
          lead_score:       leadScore,
          hot_lead:         hotLead,
          buy_signals:      buySig,
          best_send_hour:   bestSendHour,
          insights_summary: summary,
          last_analyzed_at: new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        },
        { onConflict: 'contact_id' },
      );

      analyzed++;
    }

    return NextResponse.json({ success: true, analyzed });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Revenue Analyze] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
