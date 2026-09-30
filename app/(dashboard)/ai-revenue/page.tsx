import { AIRevenueDashboard } from '@/modules/ai-revenue/components/AIRevenueDashboard';
import { requirePageRole } from '@/lib/page-guard';

export const metadata = { title: 'AI Lead Intelligence — Agentix' };

export default async function AIRevenuePage() {
  await requirePageRole('ai-revenue');
  return <AIRevenueDashboard />;
}
