// Embedding generation using OpenAI text-embedding-3-small (1536 dims)
// Tries OpenAI directly first; falls back to OpenRouter's embeddings endpoint

type EmbeddingResponse = { data?: Array<{ embedding: number[]; index: number }> };

async function callEmbeddingApi(
  key: string,
  baseUrl: string,
  model: string,
  input: string | string[],
): Promise<number[][] | null> {
  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
    });
    if (!res.ok) return null;
    const data = await res.json() as EmbeddingResponse;
    if (!data.data?.length) return null;
    return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch {
    return null;
  }
}

function getKeys() {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const orKey     = process.env.OPENROUTER_API_KEY?.replace(/﻿/g, '').trim();
  return {
    openai: openaiKey && openaiKey !== 'sk-placeholder' ? openaiKey : null,
    or:     orKey || null,
  };
}

// Single-text embedding (used by search, suggest-replies, etc.)
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const { openai, or } = getKeys();
  if (!openai && !or) return null;
  const input = text.slice(0, 8000);
  if (openai) {
    const r = await callEmbeddingApi(openai, 'https://api.openai.com/v1', 'text-embedding-3-small', input);
    if (r?.[0]) return r[0];
  }
  if (or) {
    const r = await callEmbeddingApi(or, 'https://openrouter.ai/api/v1', 'openai/text-embedding-3-small', input);
    if (r?.[0]) return r[0];
  }
  return null;
}

// Batch embedding: sends ALL texts in one API call (OpenAI supports up to 2048 inputs).
// Reduces 800 sequential calls → 1 call, fixing Vercel 60s timeout for large KB uploads.
export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const { openai, or } = getKeys();
  if (!openai && !or) return texts.map(() => null);

  const MAX_BATCH = 2048;
  const results: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch  = texts.slice(i, i + MAX_BATCH).map((t) => t.slice(0, 8000));
    let embeddings: number[][] | null = null;

    if (openai) {
      embeddings = await callEmbeddingApi(openai, 'https://api.openai.com/v1', 'text-embedding-3-small', batch);
    }
    if (!embeddings && or) {
      embeddings = await callEmbeddingApi(or, 'https://openrouter.ai/api/v1', 'openai/text-embedding-3-small', batch);
    }

    results.push(...(embeddings ?? batch.map(() => null)));
  }

  return results;
}

// Format embedding for Supabase pgvector storage: '[0.1, 0.2, ...]'
export function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
