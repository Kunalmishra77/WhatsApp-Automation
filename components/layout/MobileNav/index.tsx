'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-border bg-card/95 backdrop-blur-sm md:hidden">
      {MOBILE_NAV.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5"
          >
            {/* Active indicator bar */}
            {isActive && (
              <motion.div
                layoutId="mobile-nav-indicator"
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-brand-500"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}

            <motion.div
              animate={{ scale: isActive ? 1.12 : 1, y: isActive ? -1 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              whileTap={{ scale: 0.85 }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-xl transition-colors',
                isActive ? 'bg-brand-500/10' : '',
              )}
            >
              <Icon className={cn(
                'h-5 w-5 transition-colors',
                isActive ? 'text-brand-500' : 'text-muted-foreground',
              )} />
            </motion.div>
            <span className={cn(
              'text-[10px] font-medium transition-colors',
              isActive ? 'text-brand-500' : 'text-muted-foreground',
            )}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
