import { MetaSpendOverview } from '@/modules/admin/components/MetaSpendOverview';

export default function MetaSpendPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meta Spend</h1>
        <p className="text-sm text-gray-500 mt-0.5">Platform-wide Meta conversation-based spend across all clients</p>
      </div>
      <MetaSpendOverview />
    </div>
  );
}
