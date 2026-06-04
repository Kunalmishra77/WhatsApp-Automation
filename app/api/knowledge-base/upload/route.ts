import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { callAI } from '@/lib/ai-client';

export const maxDuration = 30;

interface KBEntry {
  title: string;
  content: string;
  category: string;
  tags?: string[];
}

// POST /api/knowledge-base/upload
// Body: { workspaceId, text, filename, fileType }
// Sends raw text to AI → AI extracts Q&A KB entries → returns entries for preview
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, text, filename, fileType } = await request.json() as {
      workspaceId?: string;
      text?: string;
      filename?: string;
      fileType?: string;
    };

    if (!workspaceId || !text?.trim()) {
      return NextResponse.json({ error: 'workspaceId and text are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const model = process.env.AI_MODEL?.trim() ?? 'openai/gpt-4o-mini';

    // For CSV/JSON, parse directly (faster, no AI needed)
    if (fileType === 'csv') {
      const entries = parseCSV(text);
      if (entries.length > 0) return NextResponse.json({ entries, source: 'file', filename });
    }
    if (fileType === 'json') {
      const entries = parseJSON(text);
      if (entries.length > 0) return NextResponse.json({ entries, source: 'file', filename });
    }

    // For TXT/MD/PDF-pasted text — use AI to intelligently extract KB entries
    const truncatedText = text.slice(0, 8000); // Keep within token limits

    const uploadMessages = [
      {
        role: 'system' as const,
        content: `You are a knowledge base extractor. Given a company document, extract clear, useful knowledge base entries that a customer support bot can use to answer customer questions.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "title": "Short descriptive title",
    "content": "Full answer the bot should give. Be specific and complete.",
    "category": "one of: general|pricing|shipping|returns|support|faq|hours|contact|product|policy",
    "tags": ["tag1", "tag2"]
  }
]

Rules:
- Extract 6-15 entries depending on content richness
- Each entry must be self-contained and directly answerable
- Merge related info into single entries (don't fragment)
- Skip boilerplate/legal text unless customer-relevant
- Make content conversational, like a support agent would say it`,
      },
      {
        role: 'user' as const,
        content: `Filename: ${filename ?? 'document'}\n\nContent:\n${truncatedText}`,
      },
    ];

    const rawContent = await callAI(uploadMessages, { model, maxTokens: 3000, temperature: 0.3 });
    if (!rawContent) {
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const raw = rawContent.trim();

    let entries: KBEntry[] = [];
    try {
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        entries = parsed.filter(
          (e): e is KBEntry => typeof e?.title === 'string' && typeof e?.content === 'string',
        );
      }
    } catch {
      return NextResponse.json({ error: 'AI returned unexpected format — try again' }, { status: 500 });
    }

    return NextResponse.json({ entries, source: 'file', filename });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function parseCSV(text: string): KBEntry[] {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const entries: KBEntry[] = [];
  const firstLine = lines[0];
  const header = firstLine?.toLowerCase() ?? '';
  const hasHeader = header.includes('title') || header.includes('question') || header.includes('content');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    const col0 = cols[0];
    const col1 = cols[1];
    if (cols.length >= 2 && col0?.trim() && col1?.trim()) {
      const col3 = cols[3];
      entries.push({
        title: col0.trim(),
        content: col1.trim(),
        category: cols[2]?.trim() ?? 'general',
        tags: col3 ? col3.split(';').map((t) => t.trim()).filter(Boolean) : [],
      });
    }
  }
  return entries;
}

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

function parseJSON(text: string): KBEntry[] {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is KBEntry => typeof e?.title === 'string' && typeof e?.content === 'string',
    ).map((e) => ({
      title: e.title,
      content: e.content,
      category: e.category ?? 'general',
      tags: Array.isArray(e.tags) ? e.tags : [],
    }));
  } catch {
    return [];
  }
}
