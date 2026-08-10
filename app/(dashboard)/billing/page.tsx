import { MetaSpendDashboard } from '@/modules/billing/components/MetaSpendDashboard';
import { requirePageRole } from '@/lib/page-guard';

export default async function BillingPage() {
  await requirePageRole('billing');
  return <MetaSpendDashboard />;
}
