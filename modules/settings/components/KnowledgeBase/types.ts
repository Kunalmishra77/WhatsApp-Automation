export interface KBEntry {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: 'manual' | 'file' | 'ai' | 'template';
  source_filename: string | null;
  is_active: boolean;
  is_draft: boolean;
  priority: number;
  char_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface KBEntryDraft {
  title: string;
  content: string;
  category: string;
  tags: string[];
  source?: string;
  sourceFilename?: string;
  priority?: number;
}

export const CATEGORIES = [
  'general', 'pricing', 'product', 'shipping', 'returns',
  'support', 'faq', 'hours', 'contact', 'policy',
] as const;

export type Category = typeof CATEGORIES[number];

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  general:  { label: 'General',   color: 'bg-gray-100 text-gray-700 border-gray-200' },
  pricing:  { label: 'Pricing',   color: 'bg-green-100 text-green-700 border-green-200' },
  product:  { label: 'Product',   color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  shipping: { label: 'Shipping',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  returns:  { label: 'Returns',   color: 'bg-orange-100 text-orange-700 border-orange-200' },
  support:  { label: 'Support',   color: 'bg-purple-100 text-purple-700 border-purple-200' },
  faq:      { label: 'FAQ',       color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  hours:    { label: 'Hours',     color: 'bg-teal-100 text-teal-700 border-teal-200' },
  contact:  { label: 'Contact',   color: 'bg-pink-100 text-pink-700 border-pink-200' },
  policy:   { label: 'Policy',    color: 'bg-red-100 text-red-700 border-red-200' },
};

export const SOURCE_META: Record<string, { label: string; color: string; icon: string }> = {
  manual:   { label: 'Manual',    color: 'bg-slate-100 text-slate-600',  icon: '✍️' },
  file:     { label: 'Uploaded',  color: 'bg-blue-50 text-blue-600',     icon: '📄' },
  ai:       { label: 'AI',        color: 'bg-purple-50 text-purple-600', icon: '✨' },
  template: { label: 'Template',  color: 'bg-amber-50 text-amber-600',   icon: '📋' },
};
