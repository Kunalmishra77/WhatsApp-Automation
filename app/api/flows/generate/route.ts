import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

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

    const apiKey = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

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

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentix.com',
        'X-Title': 'Agentix Flow Builder',
      },
      body: JSON.stringify({
        model: await (await import('@/lib/ai-model')).resolveWorkspaceModel(workspaceId),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `Create a WhatsApp nurture flow for: ${description.trim()}` },
        ],
        max_tokens: 2000,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[FlowGenerate] OpenRouter error:', err);
      return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content ?? '';

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
