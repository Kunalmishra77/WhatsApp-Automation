import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { getUser } from '@/modules/auth/services/auth.service';
import { createAdminClient } from '@/services/supabase/admin';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const user = await getUser();
  if (!user) redirect('/login');

  // Check is_platform_admin
  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) redirect('/');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
            A
          </div>
          <span className="font-semibold text-foreground">Agentix Admin</span>
          <Badge variant="secondary" className="text-xs">Platform</Badge>
        </div>
        <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Dashboard
        </a>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
