// Embedding generation and semantic search using OpenAI text-embedding-3-small
// Used for Knowledge Base semantic search (pgvector cosine similarity)

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS  = 1536;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  // Try OpenAI directly first; fall back to OpenRouter
  const orKey  = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();

  const key = apiKey && apiKey !== 'sk-placeholder' ? apiKey : null;

  if (!key && !orKey) return null;

  try {
    // Use OpenAI embeddings endpoint (OpenRouter also supports this path)
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key ?? orKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// Format embedding for Supabase pgvector storage: '[0.1, 0.2, ...]'
export function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
