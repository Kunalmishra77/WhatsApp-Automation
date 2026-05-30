'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTeam, useUpdateMemberRole } from '../../hooks/useTeam';
import { ROLE_LABELS, ROLE_COLORS } from '../../services/team.service';
import type { Database } from '@/types/database.types';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';

type UserRole = Database['public']['Tables']['workspace_members']['Row']['role'];
const ROLES: UserRole[] = ['super_admin', 'admin', 'manager', 'agent'];

export function TeamPage() {
  const { data: members = [], isLoading } = useTeam();
  const updateRole = useUpdateMemberRole();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const onlineCount = members.filter((m) => m.is_online).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-foreground">Team</h1>
          {!isLoading && (
            <Badge variant="outline" className="text-xs gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              {onlineCount} online
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled>
          <UserPlus className="h-3.5 w-3.5" /> Invite Member
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Max Chats</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : members.map((m) => {
                  const initials = m.full_name.slice(0, 2).toUpperCase();
                  const isSelf = m.user_id === currentUserId;
                  return (
                    <TableRow key={m.member_id} className="hover:bg-accent">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={m.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                              m.is_online ? 'bg-emerald-500' : 'bg-gray-300',
                            )} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{m.full_name}</p>
                            {isSelf && <p className="text-[10px] text-muted-foreground">You</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        {isSelf ? (
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ROLE_COLORS[m.role])}>
                            {ROLE_LABELS[m.role]}
                          </span>
                        ) : (
                          <Select
                            value={m.role}
                            onValueChange={async (v) => {
                              await updateRole.mutateAsync({ memberId: m.member_id, role: v as UserRole });
                              toast.success('Role updated');
                            }}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn('text-xs font-medium', m.is_online ? 'text-emerald-600' : 'text-muted-foreground')}>
                          {m.is_online ? 'Online' : 'Offline'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.max_chats}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(m.joined_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
