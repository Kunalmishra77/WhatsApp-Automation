import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI, getActiveProvider } from '@/lib/ai-client';
import { FLOW_SYSTEM_PROMPT, parseGeneratedFlow } from '@/lib/flow-generate';
import { validateFlow } from '@/lib/flow-validate';

// Matches the other AI routes. Declared rather than relied on by default so this
// one cannot drift onto a runtime where the admin Supabase client is unavailable.
export const runtime = 'nodejs';

// POST /api/flows/generate
// Body: { workspaceId: string, description: string }
// Returns: { name, description, trigger_type, trigger_value, nodes, edges, warnings, repairs }
//
// The prompt and the parser live in lib/flow-generate.ts and are tested there.
// This route is the model call, the retry, and the check before the author sees
// anything.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, description } = await request.json() as {
      workspaceId?: string;
      description?: string;
    };

    if (!workspaceId || !description?.trim()) {
      return NextResponse.json({ error: 'workspaceId and description required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const flowModel = await (await import('@/lib/ai-model')).resolveWorkspaceModel(workspaceId);
    const messages = [
      { role: 'system' as const, content: FLOW_SYSTEM_PROMPT },
      { role: 'user' as const, content: `Design the flow for: ${description.trim()}` },
    ];

    // 3000, not 2000: the palette is thirteen node types now and a flow that
    // uses it is longer than one built from six. A real six-node generation
    // used 911 tokens; a branching flow with choices and a template runs well
    // past that, and the only symptom of the old limit was JSON that looked
    // malformed rather than cut off.
    const callOptions = {
      model: flowModel,
      maxTokens: 3000,
      temperature: 0.4,
      workspaceId,
      task: 'flow_generate',
    };

    let raw = await callAI(messages, { ...callOptions, jsonMode: true });

    // `jsonMode` is the only thing this route does that every working AI path in
    // this codebase does not, and it is passed to each provider in the failover
    // chain: a model that does not accept `response_format` makes BOTH providers
    // fail and the whole call return null. That is the most likely cause of the
    // 502 nobody could reproduce — the AI was answering normally the same hour,
    // on paths that never ask for JSON mode. So ask again without it; the parser
    // reads a fenced or prefixed reply either way.
    if (!raw) {
      console.warn(`[FlowGenerate] json-mode call returned null — retrying without it (model=${flowModel})`);
      raw = await callAI(messages, { ...callOptions, jsonMode: false });
    }

    if (!raw) {
      // A bare 502 said nothing. Name the model and the provider chain actually
      // tried, so the next failure points somewhere instead of being guessed at.
      const providers = getActiveProvider();
      console.error(`[FlowGenerate] both attempts returned null — model=${flowModel} providers=${providers} workspace=${workspaceId}`);
      return NextResponse.json({
        error: providers.startsWith('none')
          ? 'No AI provider is configured on the server (OPENAI_API_KEY / OPENROUTER_API_KEY).'
          : `AI generation failed. Tried ${providers} with ${flowModel}, with and without JSON mode. The server log has the provider's own error.`,
      }, { status: 502 });
    }

    const parsed = parseGeneratedFlow(raw);
    if (!parsed) {
      // Truncation and a model fault look identical in the editor, and only one
      // of them is the author's to fix.
      const truncated = !raw.trimEnd().endsWith('}');
      console.error(`[FlowGenerate] unusable reply (${raw.length} chars, truncated=${truncated})`);
      return NextResponse.json({
        error: truncated
          ? 'The flow came back cut off — try a shorter description.'
          : 'The AI did not return a flow. Try describing it again, with the steps in order.',
      }, { status: 502 });
    }

    // The author sees this flow in the editor next, so run the editor's own
    // checks here. A generated starting point that warns the moment it opens is
    // not a starting point — and the client cannot tell our mistake from theirs.
    const warnings = validateFlow(parsed.flow.nodes, parsed.flow.edges);
    if (warnings.length > 0) {
      console.warn(
        `[FlowGenerate] generated flow has ${warnings.length} warning(s): ` +
        warnings.map((w) => w.kind).join(', '),
      );
    }

    return NextResponse.json({ ...parsed.flow, repairs: parsed.repairs, warnings });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[FlowGenerate]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
