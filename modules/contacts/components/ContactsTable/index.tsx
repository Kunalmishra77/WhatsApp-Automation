'use client';

import { useState, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, UserPlus, Upload, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { useContacts } from '../../hooks/useContacts';
import { ContactForm } from '../ContactForm';
import { ImportWizard } from '../ImportWizard';
import { StartConversationDialog } from '../StartConversationDialog';
import { useDebounce } from '@/hooks/useDebounce';
import type { ContactRow } from '../../services/contact.service';

interface ContactsTableProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ContactsTable({ selectedId, onSelect }: ContactsTableProps) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [messageContact, setMessageContact] = useState<ContactRow | null>(null);

  const { data, isLoading } = useContacts({ search }, page);
  const contacts: ContactRow[] = data?.data ?? [];
  const total = data?.count ?? 0;
  const pageSize = 50;
  const totalPages = Math.ceil(total / pageSize);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setPage(0);
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between flex-wrap gap-2 border-b border-border bg-card px-4 py-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={handleSearch}
            placeholder="Search by name, phone, email…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> New Contact
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-48 sm:w-64">Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden lg:table-cell">Company</TableHead>
              <TableHead className="hidden sm:table-cell">Tags</TableHead>
              <TableHead className="hidden md:table-cell">Added</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : contacts.map((contact) => {
                  const name = contact.name ?? contact.phone;
                  const initials = name.slice(0, 2).toUpperCase();
                  return (
                    <TableRow
                      key={contact.id}
                      className={`cursor-pointer hover:bg-accent ${contact.id === selectedId ? 'bg-brand-500/5' : ''}`}
                      onClick={() => onSelect(contact.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="bg-brand-100 text-brand-700 text-[11px] font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium text-foreground truncate max-w-40">
                            {name}
                          </span>
                          {contact.is_blocked && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1">blocked</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{contact.phone}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{contact.email ?? '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{contact.company ?? '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1">{tag}</Badge>
                          ))}
                          {contact.tags.length > 2 && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">+{contact.tags.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {format(new Date(contact.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-brand-500 hover:text-brand-600 hover:bg-brand-50"
                          title="Start conversation"
                          onClick={() => setMessageContact(contact)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        {!isLoading && contacts.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">No contacts found.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ContactForm open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} />
      <StartConversationDialog
        contact={messageContact}
        open={!!messageContact}
        onClose={() => setMessageContact(null)}
      />
    </div>
  );
}
