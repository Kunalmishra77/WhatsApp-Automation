import { requirePageRole } from '@/lib/page-guard';
import { MemberProfile } from '@/modules/team/components/MemberProfile';

// A colleague's profile sits behind the same gate as the Team page itself.
export default async function TeamMemberPage() {
  await requirePageRole('team');
  return <MemberProfile />;
}
