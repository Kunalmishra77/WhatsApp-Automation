import { KanbanBoard } from '@/modules/crm/components/KanbanBoard';
import { requirePageRole } from '@/lib/page-guard';

export default async function CrmPage() {
  await requirePageRole('crm');
  return <KanbanBoard />;
}
