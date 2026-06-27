import { MetaBillingOverview } from '@/modules/admin/components/MetaBillingOverview';

export default function MetaBillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meta Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">WhatsApp API usage across all client WABAs</p>
      </div>
      <MetaBillingOverview />
    </div>
  );
}
