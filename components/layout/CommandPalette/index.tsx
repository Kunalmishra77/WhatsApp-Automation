'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Users, Kanban, Megaphone,
  FileText, BarChart3, Settings, Users2,
} from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { useUIStore } from '@/store/ui.store';
import type { LucideIcon } from 'lucide-react';

const PAGES: Array<{ href: string; icon: LucideIcon; label: string }> = [
  { href: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { href: '/contacts',      icon: Users,         label: 'Contacts'      },
  { href: '/crm',           icon: Kanban,        label: 'CRM Pipeline'  },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns'     },
  { href: '/templates',     icon: FileText,      label: 'Templates'     },
  { href: '/team',          icon: Users2,        label: 'Team'          },
  { href: '/analytics',     icon: BarChart3,     label: 'Analytics'     },
  { href: '/settings',      icon: Settings,      label: 'Settings'      },
];

export function CommandPalette() {
  const open                 = useUIStore((s) => s.commandPaletteOpen);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const router               = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleCommandPalette]);

  function runCommand(fn: () => void) {
    toggleCommandPalette();
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={toggleCommandPalette}>
      <CommandInput placeholder="Search pages, contacts, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {PAGES.map(({ href, icon: Icon, label }) => (
            <CommandItem
              key={href}
              value={label}
              onSelect={() => runCommand(() => router.push(href))}
              className="gap-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem
            value="new conversation"
            onSelect={() => runCommand(() => router.push('/conversations'))}
            className="gap-2 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            New Conversation
          </CommandItem>
          <CommandItem
            value="new contact"
            onSelect={() => runCommand(() => router.push('/contacts'))}
            className="gap-2 cursor-pointer"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            New Contact
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
