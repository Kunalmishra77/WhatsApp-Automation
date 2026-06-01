'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, Mail, Building2, Globe, Tag, Pencil, Trash2, Ban, X, ListChecks } from 'lucide-react';
import { format } from 'date-fns';
import { useContact, useUpdateContact, useDeleteContact } from '../../hooks/useContacts';
import { ContactForm } from '../ContactForm';
import { useSequences } from '@/modules/settings/hooks/useSequences';
import { toast } from 'sonner';

interface ContactDetailProps {
  contactId: string;
  onClose: () => void;
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function ContactDetail({ contactId, onClose }: ContactDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [selectedSeqId, setSelectedSeqId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const { data: contact, isLoading } = useContact(contactId);
  const update = useUpdateContact();
  const remove = useDeleteContact();
  const { data: sequences = [] } = useSequences();

  if (isLoading) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-card p-4 space-y-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" />
      </div>
    );
  }
  if (!contact) return null;

  const name = contact.name ?? contact.phone;
  const initials = name.slice(0, 2).toUpperCase();

  const toggleBlock = async () => {
    await update.mutateAsync({ id: contact.id, payload: { is_blocked: !contact.is_blocked } });
    toast.success(contact.is_blocked ? 'Contact unblocked' : 'Contact blocked');
  };

  const handleEnroll = async () => {
    if (!selectedSeqId) { toast.error('Select a sequence first'); return; }
    setEnrolling(true);
    try {
      const res = await fetch(`/api/sequences/${selectedSeqId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Enrollment failed');
      toast.success('Contact enrolled in sequence');
      setSelectedSeqId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setEnrolling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await remove.mutateAsync(contact.id);
    toast.success('Contact deleted');
    onClose();
  };

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Contact Details</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-brand-100 text-brand-700 text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{name}</p>
              {contact.name && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
            </div>
            {contact.is_blocked && (
              <Badge variant="destructive" className="text-xs">Blocked</Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              variant="outline" size="sm"
              className={`flex-1 gap-1.5 text-xs ${contact.is_blocked ? 'text-emerald-600' : 'text-amber-600'}`}
              onClick={() => void toggleBlock()}
            >
              <Ban className="h-3.5 w-3.5" />
              {contact.is_blocked ? 'Unblock' : 'Block'}
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Info</p>
            <Row icon={Phone} label="Phone" value={contact.phone} />
            <Row icon={Mail} label="Email" value={contact.email} />
            <Row icon={Building2} label="Company" value={contact.company} />
            <Row icon={Globe} label="Country" value={contact.country} />
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 text-[11px] text-muted-foreground">Added</span>
              <p className="text-sm text-foreground">{format(new Date(contact.created_at), 'MMM d, yyyy')}</p>
            </div>
          </div>

          {contact.tags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="gap-1 text-xs">
                      <Tag className="h-2.5 w-2.5" />{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {sequences.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  Enroll in Sequence
                </p>
                <Select value={selectedSeqId} onValueChange={setSelectedSeqId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a sequence…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sequences.filter((s) => s.is_active).map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5"
                  onClick={() => void handleEnroll()}
                  disabled={!selectedSeqId || enrolling}
                >
                  {enrolling ? 'Enrolling…' : 'Enroll'}
                </Button>
              </div>
            </>
          )}

          <Separator />
          <Button
            variant="ghost" size="sm"
            className="w-full gap-1.5 text-xs text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Contact
          </Button>
        </div>
      </ScrollArea>

      <ContactForm open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
    </div>
  );
}
