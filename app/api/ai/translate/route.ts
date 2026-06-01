import { type NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { text, conversationId } = await request.json() as {
      text?: string;
      conversationId?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
    const model = process.env.AI_MODEL?.trim() ?? 'openai/gpt-4o-mini';

    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
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
              content:
                'You are a translation assistant. Translate the given text to English. Also detect the source language. Reply with ONLY a JSON object: {"translated": "...", "detectedLang": "..."} where detectedLang is the ISO 639-1 code (e.g. "hi", "es", "ar"). If text is already English, return {"translated": "<original text>", "detectedLang": "en"}.',
            },
            { role: 'user', content: text.slice(0, 500) },
          ],
          max_tokens: 300,
          temperature: 0,
        }),
      });
    } catch (fetchErr) {
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'TimeoutError';
      console.error('[Translate] Fetch error:', fetchErr);
      return NextResponse.json(
        { error: isTimeout ? 'Translation timed out — try again' : 'Failed to reach AI service' },
        { status: 503 },
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Translate] OpenRouter error:', res.status, errText);
      // Return the original text as fallback so UI doesn't break
      return NextResponse.json({
        translated: text,
        detectedLang: 'unknown',
        error: `AI error: ${res.status}`,
      });
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';

    let translated = text;
    let detectedLang = 'en';

    try {
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned) as { translated?: string; detectedLang?: string };
      translated = parsed.translated ?? text;
      detectedLang = parsed.detectedLang ?? 'en';
    } catch {
      // AI returned plain text — use it directly as translation
      translated = raw || text;
    }

    // Non-blocking: save detected language to contact (fire-and-forget)
    if (conversationId && detectedLang !== 'en' && detectedLang !== 'unknown') {
      void saveContactLanguage(conversationId, detectedLang, apiKey);
    }

    return NextResponse.json({ translated, detectedLang });
  } catch (error) {
    console.error('[Translate] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function saveContactLanguage(
  conversationId: string,
  lang: string,
  _apiKey: string,
) {
  try {
    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;
    const { data: conv } = await db
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single();
    if (conv?.contact_id) {
      await db
        .from('contacts')
        .update({ language: lang })
        .eq('id', conv.contact_id);
    }
  } catch { /* silent — non-critical */ }
}
