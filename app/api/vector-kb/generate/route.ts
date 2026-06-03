import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createAdminClient } from '@/services/supabase/admin';
import { generateEmbedding, formatEmbedding } from '@/lib/embeddings';

const DOC_TYPES: Record<string, string> = {
  faq:           'Frequently Asked Questions (FAQ)',
  product_info:  'Product / Service Information',
  pricing:       'Pricing & Plans',
  policies:      'Policies (Return, Refund, Shipping, etc.)',
  onboarding:    'Customer Onboarding Guide',
  support:       'Support Troubleshooting Guide',
  company_info:  'Company / About Us',
  custom:        'Custom Document',
};

// POST /api/vector-kb/generate
// Body: { workspaceId, docType, prompt, businessName, language? }
// Returns: { content: string, filename: string }  (NOT saved yet — user reviews first)
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, docType, prompt, businessName, language = 'English' } = await request.json() as {
      workspaceId?: string;
      docType?: string;
      prompt?: string;
      businessName?: string;
      language?: string;
    };

    if (!workspaceId || !prompt?.trim()) {
      return NextResponse.json({ error: 'workspaceId and prompt required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const apiKey = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

    const docTypeLabel = DOC_TYPES[docType ?? 'custom'] ?? 'Custom Document';
    const biz = businessName?.trim() || 'the business';

    const systemPrompt = `You are a professional business content writer. Generate a comprehensive, well-structured document for a WhatsApp AI knowledge base.

The document will be used by an AI chatbot to answer customer queries on WhatsApp. Write in clear, conversational language that works well when chunked into 500-character pieces for vector search.

Rules:
- Write in ${language}
- Use clear headings (##), bullet points, and numbered lists where helpful
- Be specific and detailed — vague answers don't help customers
- Each section should be self-contained (makes better vector chunks)
- Include realistic examples and specific details
- Format: Markdown with ## headings for each section
- Minimum 800 words, maximum 2000 words
- No fluff — every sentence should be useful for answering customer questions`;

    const userPrompt = `Business: ${biz}
Document type: ${docTypeLabel}
Details: ${prompt.trim()}

Generate a complete, detailed ${docTypeLabel} document for ${biz}.`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentix.com',
        'X-Title': 'Agentix KB Generator',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens: 3000,
        temperature: 0.6,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content?.trim() ?? '';

    if (!content) return NextResponse.json({ error: 'AI returned empty content' }, { status: 500 });

    const slug = (businessName ?? 'document').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const typeSlug = (docType ?? 'custom').replace(/[^a-z0-9_]/g, '');
    const filename = `${slug}_${typeSlug}_ai_generated.txt`;

    return NextResponse.json({ content, filename, docType: docTypeLabel });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[VectorKB Generate]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/vector-kb/generate/save
// Already handled by the main upload route — this is a convenience route
// that takes text content directly (not a file) and saves to vector_documents
export async function PUT(request: NextRequest) {
  try {
    const { workspaceId, content, filename } = await request.json() as {
      workspaceId?: string;
      content?: string;
      filename?: string;
    };

    if (!workspaceId || !content?.trim() || !filename?.trim()) {
      return NextResponse.json({ error: 'workspaceId, content, and filename required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    // Chunk the content
    const cleaned = content.replace(/[^\x20-\x7E\n\r\tऀ-ॿ਀-੿]/g, ' ').trim();
    const chunks: string[] = [];
    let i = 0;
    while (i < cleaned.length) {
      const chunk = cleaned.slice(i, i + 500).trim();
      if (chunk.length > 30) chunks.push(chunk);
      i += 500 - 50;
    }

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No usable text found' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // Delete existing chunks for this filename
    await db.from('vector_documents').delete()
      .eq('workspace_id', workspaceId)
      .eq('filename', filename);

    let inserted = 0;
    const batchSize = 10;

    for (let b = 0; b < chunks.length; b += batchSize) {
      const batch = chunks.slice(b, b + batchSize);
      const rows = await Promise.all(
        batch.map(async (chunk, idx) => {
          const embedding = await generateEmbedding(chunk);
          return {
            workspace_id: workspaceId,
            filename,
            file_type:    'txt',
            chunk_index:  b + idx,
            content:      chunk,
            embedding:    embedding ? formatEmbedding(embedding) : null,
          };
        }),
      );
      const { error } = await db.from('vector_documents').insert(rows);
      if (!error) inserted += rows.length;
    }

    return NextResponse.json({ success: true, filename, chunks_created: inserted });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[VectorKB Generate Save]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
