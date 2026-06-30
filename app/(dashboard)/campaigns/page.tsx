import { CampaignList } from '@/modules/campaigns/components/CampaignList';
import { requirePageRole } from '@/lib/page-guard';

export default async function CampaignsPage() {
  await requirePageRole('campaigns');
  return <CampaignList />;
}
