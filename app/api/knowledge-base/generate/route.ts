import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

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

    const apiKey = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
    const model = process.env.AI_MODEL?.trim() ?? 'openai/gpt-4o-mini';

    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://whatsapp-automation-kohl-six.vercel.app',
          'X-Title': 'Agentix',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
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
              role: 'user',
              content: `Company description: ${companyDescription.trim().slice(0, 1000)}`,
            },
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });
    } catch (fetchErr) {
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'TimeoutError';
      return NextResponse.json(
        { error: isTimeout ? 'AI timed out — try again' : 'Failed to reach AI service' },
        { status: 503 },
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[KB Generate] OpenRouter error:', res.status, errText);
      return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';

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
