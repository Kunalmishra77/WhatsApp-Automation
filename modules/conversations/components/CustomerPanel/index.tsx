'use client';

import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Mail, Building2, Tag, Globe } from 'lucide-react';
import { createClient } from '@/services/supabase/client';
import type { Database } from '@/types/database.types';

type ContactRow = Database['public']['Tables']['contacts']['Row'];

interface CustomerPanelProps {
  conversationId: string;
}

async function fetchContactForConversation(conversationId: string): Promise<ContactRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('id', conversationId)
    .single() as { data: { contact_id: string } | null };
  if (!conv) return null;

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', conv.contact_id)
    .single();
  return contact as ContactRow | null;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-xs text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function CustomerPanel({ conversationId }: CustomerPanelProps) {
  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact-for-conv', conversationId],
    queryFn: () => fetchContactForConversation(conversationId),
    enabled: !!conversationId,
  });

  if (isLoading) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-card p-4 space-y-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  const name = contact?.name ?? contact?.phone ?? 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            <Avatar className="h-14 w-14">
              <AvatarImage src={contact?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-brand-100 text-brand-700 text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">{contact?.phone}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact Info
            </p>
            <InfoRow icon={Phone} label="Phone" value={contact?.phone ?? null} />
            <InfoRow icon={Mail} label="Email" value={contact?.email ?? null} />
            <InfoRow icon={Building2} label="Company" value={contact?.company ?? null} />
            <InfoRow icon={Globe} label="Country" value={contact?.country ?? null} />
          </div>

          {contact?.tags && contact.tags.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[11px] gap-1">
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {contact?.is_blocked && (
            <Badge variant="destructive" className="w-full justify-center">
              Blocked
            </Badge>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
