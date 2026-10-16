import { CampaignDetail } from '@/modules/campaigns/components/CampaignDetail';
import { requirePageRole } from '@/lib/page-guard';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // The list page is guarded; without this, an agent denied Campaigns could still
  // open any campaign straight by its id.
  await requirePageRole('campaigns');
  const { id } = await params;
  return <CampaignDetail campaignId={id} />;
}
