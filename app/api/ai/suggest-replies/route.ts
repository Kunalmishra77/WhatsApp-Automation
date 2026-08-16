import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';
import { fetchKnowledgeBaseContext, detectMessageLanguage, languageDirective } from '@/lib/ai-reply';

export const maxDuration = 30;

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

    const workspaceId: string = conversation.workspace_id;
    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    // Fetch last 12 messages for richer context (was 5)
    const { data: messages, error: msgError } = await db
      .from('messages')
      .select('direction, content, sender_type')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(12);

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

    // Last inbound (customer) message drives KB retrieval + language detection
    const lastCustomerMessage = [...reversed]
      .reverse()
      .find((m) => m.direction === 'inbound')?.content ?? '';

    // Admin client: read the workspace's OWN persona + KB (bypasses RLS the same
    // way lib/ai-reply.ts does for the auto-reply path).
    const adminClient = createAdminClient();
    const adminDb = adminClient as any;

    const { data: workspace } = await adminDb
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();

    const wsSettings = (workspace?.settings ?? {}) as Record<string, unknown>;
    const agentPersona = (wsSettings.agent_persona as string | undefined)?.trim() ?? '';

    // Knowledge base context grounded on the latest customer message
    const kbContext = lastCustomerMessage
      ? await fetchKnowledgeBaseContext(adminClient, workspaceId, lastCustomerMessage)
      : '';

    const { resolveWorkspaceModel } = await import('@/lib/ai-model');
    const model = await resolveWorkspaceModel(workspaceId);

    // KB goes FIRST so the model reads it before persona content (mirrors ai-reply.ts)
    const kbBlock = kbContext
      ? `KNOWLEDGE BASE — ground your suggested replies in this content when relevant:

${kbContext}

---END OF KNOWLEDGE BASE---

`
      : '';

    const basePersona = agentPersona
      ? agentPersona
      : 'You are a helpful WhatsApp customer support assistant.';

    const systemPrompt = `${kbBlock}${basePersona}

TASK: You are helping a human agent reply to this WhatsApp conversation. Suggest exactly 3 distinct, short (<120 char) replies the human agent could send next, grounded in the knowledge base when relevant, in the customer's language. Return ONLY a JSON array of 3 strings, no explanation.`;

    // Append language directive so suggestions match the customer's language
    const langInstruction = languageDirective(detectMessageLanguage(lastCustomerMessage));

    const aiMessages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `Conversation:\n${conversationContext}\n\nSuggest 3 replies:${langInstruction}`,
      },
    ];

    const rawContent = await callAI(aiMessages, { model, maxTokens: 250, temperature: 0.7 });
    if (!rawContent) {
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const raw = rawContent.trim();

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
