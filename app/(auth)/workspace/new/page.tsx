import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { WorkspaceCreateForm } from '@/modules/auth/components/WorkspaceCreateForm';

export const metadata: Metadata = { title: 'Create Workspace' };

export default function WorkspaceNewPage() {
  return (
    <AuthCard
      title="Create your workspace"
      subtitle="Set up your team's WhatsApp CRM hub in seconds"
    >
      <WorkspaceCreateForm />
    </AuthCard>
  );
}
