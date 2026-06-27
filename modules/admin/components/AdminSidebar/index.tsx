'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Smartphone, Ticket,
  Activity, Settings, ChevronRight, Brain, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { label: 'Dashboard',    href: '/admin',              icon: LayoutDashboard },
  { label: 'Clients',      href: '/admin/clients',      icon: Users           },
  { label: 'Meta Billing', href: '/admin/meta-billing', icon: Smartphone      },
  { label: 'Support',      href: '/admin/support',      icon: Ticket          },
  { label: 'Health',       href: '/admin/health',        icon: Activity        },
  { label: 'Settings',     href: '/admin/settings',     icon: Settings        },
] as const;

export function AdminSidebar({ name }: { name: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] flex flex-col z-50"
      style={{ backgroundColor: '#0D1117' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: 'linear-gradient(135deg, #F97316, #ea6c0a)' }}>
          <Brain className="h-4 w-4 text-white" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-sm font-bold text-white tracking-wide">
            <span style={{ color: '#F97316' }}>A</span>GENT<span className="text-white/60">i</span><span style={{ color: '#F97316' }}>X</span>
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <ShieldCheck className="h-2.5 w-2.5" style={{ color: '#F97316' }} />
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#F97316' }}>
              Super Admin
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? 'text-white'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
              )}
              style={active ? { backgroundColor: 'rgba(249,115,22,0.15)', color: '#F97316' } : {}}>
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </div>
              {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: 'rgba(249,115,22,0.3)', border: '1px solid rgba(249,115,22,0.4)' }}>
            {name[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/80 truncate">{name}</p>
            <p className="text-[10px] text-white/30">Platform Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
