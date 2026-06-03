import { createAdminClient } from '@/services/supabase/admin';

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai:    'openai/gpt-4o-mini',
  anthropic: 'anthropic/claude-haiku-20240307',
  gemini:    'google/gemini-flash-1.5',
  groq:      'meta-llama/llama-3.1-8b-instruct:free',
  openrouter: 'openai/gpt-4o-mini',
};

const FALLBACK = process.env.AI_MODEL ?? 'openai/gpt-4o-mini';

export async function resolveWorkspaceModel(workspaceId: string): Promise<string> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from('workspaces')
      .select('ai_provider, ai_model')
      .eq('id', workspaceId)
      .single();

    if (!data) return FALLBACK;

    const model    = (data.ai_model    as string | null)?.trim();
    const provider = (data.ai_provider as string | null)?.trim();

    if (model)    return model;
    if (provider && PROVIDER_DEFAULTS[provider]) return PROVIDER_DEFAULTS[provider]!;
    return FALLBACK;
  } catch {
    return FALLBACK;
  }
}
