import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';
import { readLeadRules } from '@/lib/lead-classifier';

export const runtime = 'nodejs';
export const maxDuration = 30;

// POST /api/lead-rules/suggest  Body: { workspaceId }
// The AI reads the business profile + a sample of recent customer messages and
// proposes Hot/Warm thresholds + short business-specific scoring guidance. The
// result is a RECOMMENDATION only — the UI lets the user accept / edit / reject.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = (await request.json()) as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('name, industry, settings')
      .eq('id', workspaceId)
      .maybeSingle();
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const current = readLeadRules(ws.settings);

    // Sample recent inbound messages to ground the AI in how THIS business's
    // customers actually talk (what a real buying signal looks like here).
    const { data: msgs } = await db
      .from('messages')
      .select('content')
      .eq('workspace_id', workspaceId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(40);
    const samples = (msgs ?? [])
      .map((m: { content: string | null }) => (m.content ?? '').trim())
      .filter((c: string) => c.length > 0 && c.length < 300)
      .slice(0, 25);

    const settings = (ws.settings ?? {}) as Record<string, unknown>;
    const persona = typeof settings.ai_persona === 'string' ? settings.ai_persona : '';
    const businessDesc = typeof settings.business_description === 'string' ? settings.business_description : '';

    const system = `You are a CRM lead-scoring consultant. Given a business profile and a sample of real inbound customer messages, recommend how to tune its lead scoring.

Scores run 0-100. Temperature is derived from two thresholds: score >= hot → Hot, >= warm → Warm, else Cold. Defaults are hot=61, warm=31.

Return STRICT JSON only, no prose:
{"thresholds":{"hot":<int 2-100>,"warm":<int 1 to hot-1>},"guidance":"<=600 chars of concrete, business-specific scoring rules — what signals mean high intent HERE, what to discount>","rationale":"<=240 chars explaining the threshold choice in plain language"}

Rules:
- A high-ticket / long-sales-cycle business (clinics, real estate, B2B) should set a HIGHER hot threshold so only strong signals read Hot.
- A high-volume / impulse business (retail, food, fitness trials) can set a LOWER hot threshold.
- guidance must name real buying signals from THIS business's messages (e.g. "asks about appointment slots", "requests price for procedure X"), not generic advice.`;

    const userMsg = `Business name: ${ws.name ?? 'Unknown'}
Industry: ${ws.industry ?? 'unknown'}
${businessDesc ? `Description: ${businessDesc}\n` : ''}${persona ? `Bot persona: ${persona.slice(0, 400)}\n` : ''}Current thresholds: hot=${current.thresholds.hot}, warm=${current.thresholds.warm}

Sample recent customer messages:
${samples.length ? samples.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') : '(no recent inbound messages available)'}`;

    const raw = await callAI(
      [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      { model: 'openai/gpt-4o-mini', temperature: 0.2, maxTokens: 500, jsonMode: true, workspaceId, task: 'lead_rules_suggest' },
    );
    if (!raw) return NextResponse.json({ error: 'AI unavailable — please try again' }, { status: 503 });

    let parsed: { thresholds?: { hot?: number; warm?: number }; guidance?: string; rationale?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'AI returned an unparseable suggestion — please retry' }, { status: 502 });
    }

    // Clamp to valid bounds (1 <= warm < hot <= 100) before returning.
    let hot = Math.round(Number(parsed.thresholds?.hot));
    let warm = Math.round(Number(parsed.thresholds?.warm));
    if (!Number.isFinite(hot)) hot = current.thresholds.hot;
    if (!Number.isFinite(warm)) warm = current.thresholds.warm;
    hot = Math.min(100, Math.max(2, hot));
    warm = Math.min(hot - 1, Math.max(1, warm));

    const guidance = typeof parsed.guidance === 'string' ? parsed.guidance.trim().slice(0, 600) : '';
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.trim().slice(0, 240) : '';

    return NextResponse.json({
      suggestion: { thresholds: { hot, warm }, guidance, rationale },
      current: current.thresholds,
      sampled_messages: samples.length,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadRules suggest]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
