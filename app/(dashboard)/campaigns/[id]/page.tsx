import { CampaignDetail } from '@/modules/campaigns/components/CampaignDetail';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignDetail campaignId={id} />;
}
