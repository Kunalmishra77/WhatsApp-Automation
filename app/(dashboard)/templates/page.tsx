import { TemplateList } from '@/modules/templates/components/TemplateList';
import { requirePageRole } from '@/lib/page-guard';

export default async function TemplatesPage() {
  await requirePageRole('templates');
  return <TemplateList />;
}
