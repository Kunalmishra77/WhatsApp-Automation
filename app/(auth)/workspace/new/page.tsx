import { redirect } from 'next/navigation';
import { getUser } from '@/modules/auth/services/auth.service';
import { createAdminClient } from '@/services/supabase/admin';
import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { WorkspaceCreateForm } from '@/modules/auth/components/WorkspaceCreateForm';

export const metadata: Metadata = { title: 'Create Workspace' };

export default async function WorkspaceNewPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  // Platform admins should never create workspaces — send to admin panel
  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (profile?.is_platform_admin) redirect('/admin');

  return (
    <AuthCard
      title="Create your workspace"
      subtitle="Set up your team's WhatsApp CRM hub in seconds"
    >
      <WorkspaceCreateForm />
    </AuthCard>
  );
}
