import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createAdminClient } from '@/services/supabase/admin';
import { callAI } from '@/lib/ai-client';
import { resolveWorkspaceModel } from '@/lib/ai-model';

export const runtime = 'nodejs';

// POST /api/campaigns/generate-copy
// Body: { workspaceId, goal, tone?, language?, count? }
// Returns: { variants: [{ title, body }] }
//
// Generates WhatsApp broadcast copy grounded in the workspace's own business
// (name + brand voice). Stays strictly on-business — same scope rules as the
// live bot — so campaigns never drift off-topic.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, goal, tone, language, count } = await request.json() as {
      workspaceId?: string;
      goal?: string;
      tone?: string;
      language?: string;
      count?: number;
    };

    if (!workspaceId || !goal?.trim()) {
      return NextResponse.json({ error: 'workspaceId and goal required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    // Brand context: name + a short brand-voice snippet from the agent persona.
    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('name, settings')
      .eq('id', workspaceId)
      .single();

    const businessName: string = (ws?.name as string | undefined)?.trim() || 'the business';
    const persona = (ws?.settings?.agent_persona as string | undefined)?.trim() ?? '';
    const brandDescription = (ws?.settings?.business_description as string | undefined)?.trim() ?? '';
    // Persona can be huge (tens of thousands of chars) — take a short voice sample only.
    const brandVoice = brandDescription || (persona ? persona.slice(0, 800) : '');

    const nVariants = Math.min(Math.max(count ?? 3, 1), 5);
    const toneLine = tone?.trim() ? `Tone: ${tone.trim()}.` : 'Tone: warm, confident, and persuasive without being pushy.';
    const langLine = language?.trim()
      ? `Write ALL copy in ${language.trim()}.`
      : 'Write in the same language the goal is written in (English, Hindi, or Hinglish). If unclear, use Hinglish (Roman-script Hindi mixed with English) — it converts best for Indian SMB audiences.';

    const systemPrompt = `You are an expert WhatsApp marketing copywriter for ${businessName}, an Indian small/medium business.
${brandVoice ? `\nBrand voice / about the business (for reference — do NOT copy verbatim):\n${brandVoice}\n` : ''}
Write ${nVariants} DISTINCT WhatsApp broadcast message variants for the goal below.

STRICT RULES:
- Talk ONLY about ${businessName} — its products, services, and offers. Never go off-topic, never invent facts, prices, or discounts that were not given in the goal.
- WhatsApp formatting ONLY: use *single asterisks* for bold. Use plain hyphens (-) for lists. NEVER use ** double asterisks, ##, or any other markdown — WhatsApp ignores them.
- Keep each message tight and scannable: ideally 300-700 characters, never over 1000. Short lines, line breaks between ideas.
- Open with a hook, deliver the offer/value clearly, and end with ONE clear call-to-action (e.g. "Reply YES to order", "Tap to know more").
- You may use 1-3 relevant emojis per message, tastefully — not in every line.
- Make the ${nVariants} variants genuinely different in angle (e.g. urgency, benefit-led, story/question-led), not reworded copies.
- ${toneLine}
- ${langLine}

Return ONLY valid JSON in this exact shape:
{
  "variants": [
    { "title": "short 2-4 word label for this angle", "body": "the full WhatsApp message text" }
  ]
}`;

    const model = await resolveWorkspaceModel(workspaceId);
    const raw = await callAI(
      [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: `Campaign goal / offer: ${goal.trim()}` },
      ],
      { model, maxTokens: 1600, temperature: 0.8, jsonMode: true },
    );

    if (!raw) {
      return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 502 });
    }

    let parsed: { variants?: Array<{ title?: string; body?: string }> };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 });
    }

    const variants = (parsed.variants ?? [])
      .filter((v) => v && typeof v.body === 'string' && v.body.trim())
      .map((v) => ({ title: (v.title ?? 'Variant').toString().trim(), body: v.body!.trim() }));

    if (variants.length === 0) {
      return NextResponse.json({ error: 'AI response had no usable copy' }, { status: 500 });
    }

    return NextResponse.json({ variants });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[CampaignGenerateCopy]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
