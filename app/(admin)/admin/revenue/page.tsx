import { RevenueDashboard } from '@/modules/admin/components/RevenueDashboard';

export default function RevenuePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Revenue</h1>
        <p className="text-sm text-gray-400 mt-0.5">MRR, ARR, churn and financial analytics</p>
      </div>
      <RevenueDashboard />
    </div>
  );
}
