import { TeamPage } from '@/modules/team/components/TeamPage';
import { requirePageRole } from '@/lib/page-guard';

export default async function TeamPageRoute() {
  await requirePageRole('team');
  return <TeamPage />;
}
