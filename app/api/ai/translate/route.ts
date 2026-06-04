import { type NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai-client';

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

    const model = process.env.AI_MODEL?.trim() ?? 'openai/gpt-4o-mini';

    const translateMessages = [
      {
        role: 'system' as const,
        content:
          'You are a translation assistant. Translate the given text to English. Also detect the source language. Reply with ONLY a JSON object: {"translated": "...", "detectedLang": "..."} where detectedLang is the ISO 639-1 code (e.g. "hi", "es", "ar"). If text is already English, return {"translated": "<original text>", "detectedLang": "en"}.',
      },
      { role: 'user' as const, content: text.slice(0, 500) },
    ];

    const rawContent = await callAI(translateMessages, { model, maxTokens: 300, temperature: 0 });
    if (!rawContent) {
      // Return the original text as fallback so UI doesn't break
      return NextResponse.json({
        translated: text,
        detectedLang: 'unknown',
        error: 'AI request failed',
      });
    }

    const raw = rawContent.trim();

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
      void saveContactLanguage(conversationId, detectedLang);
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
