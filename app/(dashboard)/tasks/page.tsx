import { TaskBoard } from '@/modules/tasks/components/TaskBoard';
import { requirePageRole } from '@/lib/page-guard';

export default async function TasksPage() {
  await requirePageRole('tasks');
  return <TaskBoard />;
}
