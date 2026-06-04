import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';

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

    const summarizeMessages = [
      {
        role: 'system' as const,
        content:
          'You are a concise summarizer. Given a WhatsApp conversation transcript, write a 2-3 sentence summary. Include: main topic, current status/resolution, and any pending action items. Be factual and brief.',
      },
      { role: 'user' as const, content: `Conversation transcript:\n\n${transcript}` },
    ];

    const summaryContent = await callAI(summarizeMessages, {
      model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free',
      maxTokens: 200,
      temperature: 0.3,
    });
    if (!summaryContent) return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });

    const summary = summaryContent.trim() || 'Unable to generate summary.';

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
