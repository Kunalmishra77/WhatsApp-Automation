import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';

// POST /api/flows/generate
// Body: { workspaceId: string, description: string }
// Returns: { name, description, trigger_type, trigger_value, nodes, edges }
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

    const systemPrompt = `You are an expert WhatsApp chatbot flow designer. Given a user's description, generate a complete flow as JSON.

Flow node types available:
- "start" — entry point with triggerType ("keyword"|"first_message") and triggerValue
- "message" — sends a fixed message to the user
- "question" — asks a question and waits for reply (timeoutHours: number)
- "condition" — branches based on user reply (keyword match)
- "assign_agent" — hands off to a human agent with a message
- "end" — ends the flow with a message

Rules:
1. Always start with a "start" node
2. Always end paths with an "end" node
3. Edges connect nodes: { id, source, target, label? }
4. Node positions: start at {x:250,y:50}, space 150px vertically, branch horizontally by 300px
5. Lead classification: use condition nodes to detect "hot" keywords (price/buy/demo/urgent) → assign_agent; others → nurture further

Return ONLY valid JSON in this exact shape:
{
  "name": "string — short flow name",
  "description": "string — one-line description",
  "trigger_type": "keyword" | "first_message",
  "trigger_value": "string or null",
  "nodes": [
    { "id": "n1", "type": "start", "position": {"x":250,"y":50}, "data": {"label":"Start","triggerType":"keyword","triggerValue":"hi"} },
    { "id": "n2", "type": "message", "position": {"x":250,"y":200}, "data": {"label":"Welcome","message":"Hello! Welcome..."} }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" }
  ]
}`;

    const flowModel = await (await import('@/lib/ai-model')).resolveWorkspaceModel(workspaceId);
    const flowMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const,   content: `Create a WhatsApp nurture flow for: ${description.trim()}` },
    ];

    const raw = await callAI(flowMessages, {
      model: flowModel,
      maxTokens: 2000,
      temperature: 0.4,
      jsonMode: true,
    });
    if (!raw) {
      return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
    }

    let flow: Record<string, unknown>;
    try {
      flow = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 });
    }

    // Validate minimal shape
    if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
      return NextResponse.json({ error: 'AI response missing nodes/edges' }, { status: 500 });
    }

    return NextResponse.json(flow);
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[FlowGenerate]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
