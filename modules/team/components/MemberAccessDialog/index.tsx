'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ALL_PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/types/auth.types';
import { AGENT_RESTRICTABLE_PAGES, type AgentPageKey } from '@/lib/agent-pages';
import { useRoles, useUpdateMember } from '../../hooks/useTeam';
import { ROLE_LABELS } from '../../services/team.service';
import type { TeamMember } from '../../services/team.service';
import type { Database } from '@/types/database.types';

type UserRole = Database['public']['Tables']['workspace_members']['Row']['role'];
const ASSIGNABLE: UserRole[] = ['admin', 'manager', 'agent'];
const NO_CUSTOM_ROLE = '__none__';

interface Props {
  member: TeamMember | null;
  /** Permissions the member currently resolves to, for the "revoke" list. */
  effectivePermissions?: Permission[];
  isSelf: boolean;
  onClose: () => void;
}

/**
 * Edit one member's access: their title, built-in role, an optional custom role,
 * exactly which pages they may open, individual permission tweaks, and whether
 * their access is suspended.
 *
 * Everything here is enforced server-side by lib/permissions.ts — this dialog
 * only writes the configuration it reads back.
 */
export function MemberAccessDialog({ member, effectivePermissions = [], isSelf, onClose }: Props) {
  return (
    <Dialog open={member !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {member && (
          // Keyed on the member so opening a different person remounts the form
          // with their values, instead of syncing props into state in an effect.
          <Form
            key={member.member_id}
            member={member}
            effectivePermissions={effectivePermissions}
            isSelf={isSelf}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({ member, effectivePermissions, isSelf, onClose }: {
  member: TeamMember;
  effectivePermissions: Permission[];
  isSelf: boolean;
  onClose: () => void;
}) {
  const { data: roles = [] } = useRoles();
  const updateMember = useUpdateMember();

  const [title, setTitle]             = useState(member.title ?? '');
  const [role, setRole]               = useState<UserRole>(member.role);
  const [customRoleId, setCustomRole] = useState<string>(member.custom_role_id ?? NO_CUSTOM_ROLE);
  const [restricted, setRestricted]   = useState(member.page_access !== null);
  const [pages, setPages]             = useState<Set<AgentPageKey>>(new Set(member.page_access ?? []));
  const [revoked, setRevoked]         = useState<Set<Permission>>(new Set());
  const [suspended, setSuspended]     = useState(member.is_suspended);

  const togglePage = (k: AgentPageKey) => setPages((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const toggleRevoked = (p: Permission) => setRevoked((prev) => {
    const next = new Set(prev);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });

  const save = async () => {
    try {
      await updateMember.mutateAsync({
        memberId: member.member_id,
        patch: {
          title: title.trim() || null,
          customRoleId: customRoleId === NO_CUSTOM_ROLE ? null : customRoleId,
          pageAccess: restricted ? [...pages] : null,
          permissionOverrides: { grant: [], revoke: [...revoked] },
          // The API refuses a self role change or self suspension, so don't send them.
          ...(isSelf ? {} : { role, isSuspended: suspended }),
        },
      });
      toast.success(`${member.full_name}'s access updated`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update access');
    }
  };

  const usingCustomRole = customRoleId !== NO_CUSTOM_ROLE;

  return (
    <>
        <DialogHeader>
          <DialogTitle>{member.full_name}</DialogTitle>
          <DialogDescription>
            {isSelf
              ? 'You can edit your own title and page list. Your role and suspension are locked.'
              : 'Set what this person can do and see. Changes apply on their next request.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-title">Job title</Label>
                <Input id="m-title" value={title} placeholder="Senior Sales Executive"
                  onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Built-in role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)} disabled={isSelf}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE.map((r) => (
                      <SelectItem key={r} value={r} className="text-sm">{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Custom role</Label>
              <Select value={customRoleId} onValueChange={setCustomRole}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOM_ROLE} className="text-sm">
                    None — use the built-in role
                  </SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-sm">{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {usingCustomRole && (
                <p className="text-[11px] text-muted-foreground">
                  The custom role replaces the built-in role&apos;s permissions.
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Restrict pages</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Off means this person can open every page.
                  </p>
                </div>
                <Switch checked={restricted} onCheckedChange={setRestricted} />
              </div>

              {restricted && (
                <div className="grid gap-1.5 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1 pt-1">
                  {AGENT_RESTRICTABLE_PAGES.map((page) => (
                    <label key={page.key}
                      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 cursor-pointer hover:bg-accent">
                      <Checkbox checked={pages.has(page.key)} onCheckedChange={() => togglePage(page.key)} />
                      <span className="text-xs text-foreground">{page.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {effectivePermissions.length > 0 && (
              <div className="space-y-2">
                <Label>Take away specific permissions</Label>
                <p className="text-[11px] text-muted-foreground">
                  Tick anything this person should not have, even though their role grants it.
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ALL_PERMISSIONS.filter((p) => effectivePermissions.includes(p)).map((p) => (
                    <label key={p}
                      className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-2 cursor-pointer hover:bg-accent">
                      <Checkbox checked={revoked.has(p)} onCheckedChange={() => toggleRevoked(p)} />
                      <span className="text-xs leading-snug text-foreground">{PERMISSION_LABELS[p]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!isSelf && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5">
                <div>
                  <Label className="text-sm">Suspend access</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Blocks them from the workspace without deleting their history.
                  </p>
                </div>
                <Switch checked={suspended} onCheckedChange={setSuspended} />
              </div>
            )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => void save()} disabled={updateMember.isPending}>
            Save access
          </Button>
        </DialogFooter>
    </>
  );
}
