import { CampaignDetail } from '@/modules/campaigns/components/CampaignDetail';

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  return <CampaignDetail campaignId={params.id} />;
}
