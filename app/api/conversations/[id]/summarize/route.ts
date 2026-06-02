import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

// POST /api/conversations/[id]/summarize
// Body: { workspaceId }
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: conversationId } = await params;
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;

    // Fetch last 30 messages
    const { data: messages } = await db
      .from('messages')
      .select('direction, content, type, created_at')
      .eq('conversation_id', conversationId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })
      .limit(30);

    if (!messages?.length) {
      return NextResponse.json({ summary: 'No messages to summarize.' });
    }

    const transcript = (messages as Array<{ direction: string; content: string; type: string }>)
      .filter((m) => m.content && m.type === 'text')
      .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content}`)
      .join('\n');

    if (!transcript.trim()) {
      return NextResponse.json({ summary: 'No text messages to summarize.' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whatsapp-automation-kohl-six.vercel.app',
        'X-Title': 'Agentix',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free',
        messages: [
          {
            role: 'system',
            content:
              'You are a concise summarizer. Given a WhatsApp conversation transcript, write a 2-3 sentence summary. Include: main topic, current status/resolution, and any pending action items. Be factual and brief.',
          },
          { role: 'user', content: `Conversation transcript:\n\n${transcript}` },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });

    const aiData = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const summary = aiData?.choices?.[0]?.message?.content?.trim() ?? 'Unable to generate summary.';

    // Persist the summary
    await db
      .from('conversations')
      .update({ ai_summary: summary })
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId);

    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
