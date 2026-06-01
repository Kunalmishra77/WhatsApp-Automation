import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { authzResponse } from '@/lib/authz';

export const maxDuration = 30; // seconds — requires Pro; on Hobby capped at 10s

export async function POST(request: NextRequest) {
  try {
    const { text, conversationId } = await request.json() as {
      text?: string;
      conversationId?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    // Auth — require the user to be logged in (workspace checked via conversation)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    const model = process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free';

    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(8000), // 8s — stays under Vercel Hobby 10s limit
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
                'You are a translation assistant. Translate the given text to English. Also detect the source language. Reply with ONLY a JSON object in this exact format: {"translated": "...", "detectedLang": "..."} where detectedLang is the ISO 639-1 code (e.g. "hi", "es", "ar"). If text is already English, set detectedLang to "en" and translated to the original text.',
            },
            { role: 'user', content: text },
          ],
          max_tokens: 300,
          temperature: 0,
        }),
      });
    } catch (fetchErr) {
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'TimeoutError';
      console.error('[Translate] Fetch error:', fetchErr);
      return NextResponse.json(
        { error: isTimeout ? 'AI request timed out' : 'AI request failed' },
        { status: 502 },
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[Translate] OpenRouter error:', res.status, errText);
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
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
      // If AI returned plain text instead of JSON, use it directly
      translated = raw || text;
    }

    // Non-blocking: update contact's detected language
    if (conversationId && detectedLang !== 'en') {
      void (async () => {
        try {
          const db = supabase as any;
          const { data: conv } = await db
            .from('conversations')
            .select('contact_id')
            .eq('id', conversationId)
            .single();
          if (conv?.contact_id) {
            await db
              .from('contacts')
              .update({ language: detectedLang })
              .eq('id', conv.contact_id);
          }
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({ translated, detectedLang });
  } catch (error) {
    return authzResponse(error);
  }
}
