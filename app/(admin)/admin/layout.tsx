import { redirect } from 'next/navigation';
import { getUser } from '@/modules/auth/services/auth.service';
import { createAdminClient } from '@/services/supabase/admin';
import { AdminSidebar } from '@/modules/admin/components/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');

  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('profiles')
    .select('is_platform_admin, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) redirect('/');

  const name = profile?.full_name ?? user.email ?? 'Admin';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F6F8' }}>
      <AdminSidebar name={name} />
      <div className="pl-[240px]">
        <main className="min-h-screen p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
