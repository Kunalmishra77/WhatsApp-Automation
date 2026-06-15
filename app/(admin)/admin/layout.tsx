import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Brain, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { getUser } from '@/modules/auth/services/auth.service';
import { createAdminClient } from '@/services/supabase/admin';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
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
    <div className="min-h-screen bg-background">

      {/* ── Premium admin header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-navy-900 shadow-lg shadow-black/20">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6">
          {/* Left: brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-md shadow-brand-900/40">
              <Brain className="h-4 w-4 text-white" strokeWidth={1.8} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">
                <span className="text-brand-400">A</span>GENT
                <span className="text-white/70">i</span>
                <span className="text-brand-400">X</span>
              </span>
              <div className="flex items-center gap-1 rounded-full bg-brand-500/20 border border-brand-500/30 px-2 py-0.5">
                <ShieldCheck className="h-2.5 w-2.5 text-brand-300" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-brand-300">
                  Super Admin
                </span>
              </div>
            </div>
          </div>

          {/* Right: user */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-brand-500/30 border border-brand-500/40 flex items-center justify-center">
                <span className="text-[11px] font-bold text-brand-300">
                  {name[0]?.toUpperCase() ?? 'A'}
                </span>
              </div>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <span className="hidden sm:block text-xs text-white/40 font-medium">
                {name}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-nav tabs */}
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6">
          <nav className="flex gap-1 pb-0">
            <Link
              href="/admin"
              className="flex items-center gap-1.5 border-b-2 border-brand-400 px-3 py-2 text-xs font-semibold text-white/90"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Overview
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="mx-auto max-w-screen-2xl px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
