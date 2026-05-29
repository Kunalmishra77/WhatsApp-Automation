'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare, Users, Kanban, Megaphone, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const MOBILE_NAV: Array<{ href: string; icon: LucideIcon; label: string }> = [
  { href: '/conversations', icon: MessageSquare, label: 'Chats'     },
  { href: '/contacts',      icon: Users,         label: 'Contacts'  },
  { href: '/crm',           icon: Kanban,        label: 'CRM'       },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns' },
  { href: '/settings',      icon: Settings,      label: 'Settings'  },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-border bg-card md:hidden">
      {MOBILE_NAV.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors',
              isActive ? 'text-brand-600' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn('h-5 w-5', isActive && 'text-brand-500')} />
            <span className="font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
