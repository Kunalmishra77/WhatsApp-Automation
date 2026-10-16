import { requirePageRole } from '@/lib/page-guard';
import View from './view';

// Server shell: the flows list is guarded, so the builder must be too — otherwise
// an agent denied Flows could open any flow straight by its id.
export default async function Page() {
  await requirePageRole('flows');
  return <View />;
}
