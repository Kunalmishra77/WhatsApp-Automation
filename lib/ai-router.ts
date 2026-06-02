// AI Router — routes tasks to the correct model based on workspace settings
// Models are configured per workspace in workspaces.settings.llm_config

export interface LlmConfig {
  auto_reply_model:    string;
  vision_model:        string;
  escalation_model:    string;
  embedding_model:     string;
  fast_model:          string;  // Groq Llama — cheap + fast for simple tasks
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  auto_reply_model:  'openai/gpt-oss-120b:free',
  vision_model:      'openai/gpt-4o-mini',
  escalation_model:  'openai/gpt-4o-mini',
  embedding_model:   'openai/text-embedding-3-small',
  fast_model:        'groq/llama-3.1-8b-instant',
};

export type LlmTask = keyof LlmConfig;

// Reads LLM config from workspace settings, falls back to defaults + env AI_MODEL
export function getModel(settings: Record<string, unknown> | null, task: LlmTask): string {
  const cfg = (settings?.llm_config ?? {}) as Partial<LlmConfig>;
  return cfg[task] ?? DEFAULT_LLM_CONFIG[task] ?? process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free';
}

// All available models grouped by provider
export const MODEL_OPTIONS = [
  // OpenAI via OpenRouter
  { value: 'openai/gpt-4o',               label: 'GPT-4o',                   provider: 'OpenAI',  tier: 'premium' },
  { value: 'openai/gpt-4o-mini',           label: 'GPT-4o Mini',              provider: 'OpenAI',  tier: 'standard' },
  { value: 'openai/gpt-oss-120b:free',     label: 'GPT-OSS 120B (Free)',      provider: 'OpenAI',  tier: 'free' },
  { value: 'openai/o1-mini',               label: 'o1 Mini',                  provider: 'OpenAI',  tier: 'premium' },
  // Groq — ultra fast
  { value: 'groq/llama-3.1-8b-instant',   label: 'Llama 3.1 8B (Groq Fast)', provider: 'Groq',    tier: 'free' },
  { value: 'groq/llama-3.1-70b-versatile',label: 'Llama 3.1 70B (Groq)',     provider: 'Groq',    tier: 'standard' },
  { value: 'groq/mixtral-8x7b-32768',     label: 'Mixtral 8x7B (Groq)',      provider: 'Groq',    tier: 'standard' },
  // Anthropic
  { value: 'anthropic/claude-3-haiku',    label: 'Claude 3 Haiku',           provider: 'Anthropic', tier: 'standard' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet',        provider: 'Anthropic', tier: 'premium' },
  // Google
  { value: 'google/gemini-flash-1.5',     label: 'Gemini Flash 1.5',         provider: 'Google',  tier: 'free' },
  { value: 'google/gemini-pro-1.5',       label: 'Gemini Pro 1.5',           provider: 'Google',  tier: 'standard' },
];
