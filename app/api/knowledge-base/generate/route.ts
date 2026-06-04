import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, companyDescription } = await request.json() as {
      workspaceId?: string;
      companyDescription?: string;
    };

    if (!workspaceId || !companyDescription?.trim()) {
      return NextResponse.json({ error: 'workspaceId and companyDescription are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const model = process.env.AI_MODEL?.trim() ?? 'openai/gpt-4o-mini';

    const kbGenMessages = [
      {
        role: 'system' as const,
        content: `You are a customer support knowledge base generator. Based on the company description provided, generate 6-8 knowledge base entries that a WhatsApp customer support bot can use to answer customer questions accurately.

Return ONLY a valid JSON array with this exact format:
[
  {
    "title": "Short title",
    "content": "Detailed answer that the bot will use to respond to customers",
    "category": "one of: general, pricing, shipping, returns, support, faq, hours, contact"
  }
]

Make the content specific, helpful, and conversational. Include realistic details based on the company description.`,
      },
      {
        role: 'user' as const,
        content: `Company description: ${companyDescription.trim().slice(0, 1000)}`,
      },
    ];

    const rawContent = await callAI(kbGenMessages, { model, maxTokens: 2000, temperature: 0.7 });
    if (!rawContent) {
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const raw = rawContent.trim();

    let entries: Array<{ title: string; content: string; category: string }> = [];
    try {
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        entries = parsed.filter(
          (e): e is { title: string; content: string; category: string } =>
            typeof e?.title === 'string' && typeof e?.content === 'string',
        );
      }
    } catch {
      console.error('[KB Generate] Failed to parse AI response:', raw.slice(0, 200));
      return NextResponse.json({ error: 'AI returned invalid format — try again' }, { status: 500 });
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No entries generated — try again' }, { status: 500 });
    }

    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[KB Generate] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
