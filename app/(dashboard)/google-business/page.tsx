import { requirePageRole } from '@/lib/page-guard';
import View from './view';

// Server shell: enforces the admin-configured page access for the 'agent' role
// BEFORE any of this page's UI or data is rendered. The client-side hook this
// replaces only redirected after the page had already mounted and fetched.
export default async function Page() {
  await requirePageRole('google-business');
  return <View />;
}
