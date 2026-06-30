import { SettingsLayout } from '@/modules/settings/components/SettingsLayout';
import { requirePageRole } from '@/lib/page-guard';

export default async function SettingsPage() {
  await requirePageRole('settings');
  return <SettingsLayout />;
}
