// Embedding generation using OpenAI text-embedding-3-small (1536 dims)
// Tries OpenAI directly first; falls back to OpenRouter's embeddings endpoint

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const orKey     = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();

  const realOpenaiKey = openaiKey && openaiKey !== 'sk-placeholder' ? openaiKey : null;

  if (!realOpenaiKey && !orKey) return null;

  const input = text.slice(0, 8000);

  // OpenAI direct (fastest, if real key available)
  if (realOpenaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${realOpenaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input }),
      });
      if (res.ok) {
        const data = await res.json() as { data?: Array<{ embedding: number[] }> };
        if (data.data?.[0]?.embedding) return data.data[0].embedding;
      }
    } catch { /* fall through */ }
  }

  // OpenRouter embeddings endpoint (supports text-embedding-3-small, same 1536 dims)
  if (orKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${orKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input }),
      });
      if (res.ok) {
        const data = await res.json() as { data?: Array<{ embedding: number[] }> };
        if (data.data?.[0]?.embedding) return data.data[0].embedding;
      }
    } catch { /* fall through */ }
  }

  return null;
}

// Format embedding for Supabase pgvector storage: '[0.1, 0.2, ...]'
export function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
