import { BillingOverview } from '@/modules/admin/components/BillingOverview';

export default function AdminBillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Razorpay MRR, subscription health, payments and grace settings</p>
      </div>
      <BillingOverview />
    </div>
  );
}
