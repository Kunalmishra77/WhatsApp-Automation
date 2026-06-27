import { MetaBillingDetail } from '@/modules/admin/components/MetaBillingDetail';

export default async function MetaBillingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meta Billing Detail</h1>
        <p className="text-sm text-gray-500 mt-0.5">Per-workspace WhatsApp API usage</p>
      </div>
      <MetaBillingDetail workspaceId={id} />
    </div>
  );
}
