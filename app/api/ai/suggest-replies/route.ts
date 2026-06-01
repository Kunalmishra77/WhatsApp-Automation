import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';

export async function POST(request: NextRequest) {
  try {
    const { conversationId } = await request.json() as { conversationId?: string };

    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
    }

    // Look up the workspace for this conversation
    const supabase = await createClient();
    const db = supabase as any;
    const { data: conversation, error: convError } = await db
      .from('conversations')
      .select('id, workspace_id, contact:contacts(id, name, phone)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await requireWorkspacePermission(conversation.workspace_id, 'handle_conversations');

    // Fetch last 5 messages
    const { data: messages, error: msgError } = await db
      .from('messages')
      .select('direction, content, sender_type')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (msgError) {
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    const contact = conversation.contact as { id: string; name?: string; phone?: string } | null;
    const contactName = contact?.name ?? contact?.phone ?? 'Customer';

    // Reverse to chronological order for context
    const reversed: Array<{ direction: string; content: string; sender_type: string }> =
      [...(messages ?? [])].reverse();

    const conversationContext = reversed
      .map((m) => {
        if (m.direction === 'inbound') return `${contactName}: ${m.content ?? ''}`;
        return `Agent: ${m.content ?? ''}`;
      })
      .join('\n');

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    const model = process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free';

    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    const aiMessages = [
      {
        role: 'system',
        content:
          'You are a WhatsApp customer support agent for V4TOU Tech. Based on the conversation context, suggest 3 short, helpful reply options. Return ONLY a JSON array of 3 strings, no explanation. Each reply should be under 100 characters. Example: ["Thank you for contacting us!", "I\'ll check that for you.", "Could you provide more details?"]',
      },
      {
        role: 'user',
        content: `Conversation:\n${conversationContext}\n\nSuggest 3 replies:`,
      },
    ];

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whatsapp-automation-kohl-six.vercel.app',
        'X-Title': 'Agentix',
      },
      body: JSON.stringify({
        model,
        messages: aiMessages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[SuggestReplies] OpenRouter error:', errBody);
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';

    let suggestions: string[] = [];
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        suggestions = parsed.slice(0, 3).map(String);
      }
    } catch {
      console.warn('[SuggestReplies] Failed to parse AI response as JSON:', raw);
      // Try to extract array content manually
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            suggestions = parsed.slice(0, 3).map(String);
          }
        } catch {
          // fallback: empty
        }
      }
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ error: 'Could not generate suggestions' }, { status: 500 });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    return authzResponse(error);
  }
}
