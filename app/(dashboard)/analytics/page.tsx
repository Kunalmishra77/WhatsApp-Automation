import { AnalyticsDashboard } from '@/modules/analytics/components/AnalyticsDashboard';
import { requirePageRole } from '@/lib/page-guard';

export default async function AnalyticsPage() {
  await requirePageRole('analytics');
  return <AnalyticsDashboard />;
}
