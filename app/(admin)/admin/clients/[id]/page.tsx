import { ClientDetailPage } from '@/modules/admin/components/ClientDetailPage';

export default async function ClientDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientDetailPage workspaceId={id} />;
}
