'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, ShieldPlus, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { ALL_PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/types/auth.types';
import { AGENT_RESTRICTABLE_PAGES, type AgentPageKey } from '@/lib/agent-pages';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from '../../hooks/useTeam';
import type { WorkspaceRole } from '../../services/team.service';

interface Draft {
  id?:          string;
  name:         string;
  description:  string;
  permissions:  Set<Permission>;
  /** null = inherit (members of this role stay unrestricted). */
  pageAccess:   Set<AgentPageKey> | null;
}

const emptyDraft = (): Draft => ({
  name: '', description: '', permissions: new Set(), pageAccess: new Set(),
});

const draftFrom = (role: WorkspaceRole): Draft => ({
  id: role.id,
  name: role.name,
  description: role.description ?? '',
  permissions: new Set(role.permissions),
  pageAccess: role.page_access === null ? null : new Set(role.page_access),
});

/**
 * Custom roles: named permission sets an admin builds for their own
 * organisation, instead of being limited to the four built-in roles.
 *
 * A role bundles two things — what its holders may DO (permissions, enforced on
 * every API route) and what they may SEE (pages, enforced by the page guards).
 */
export function RolesManager() {
  const { data: roles = [], isLoading } = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [draft, setDraft] = useState<Draft | null>(null);

  const togglePermission = (p: Permission) => setDraft((d) => {
    if (!d) return d;
    const next = new Set(d.permissions);
    if (next.has(p)) next.delete(p); else next.add(p);
    return { ...d, permissions: next };
  });

  const togglePage = (k: AgentPageKey) => setDraft((d) => {
    if (!d || d.pageAccess === null) return d;
    const next = new Set(d.pageAccess);
    if (next.has(k)) next.delete(k); else next.add(k);
    return { ...d, pageAccess: next };
  });

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) { toast.error('Give the role a name'); return; }

    const input = {
      name,
      description: draft.description.trim(),
      permissions: [...draft.permissions],
      pageAccess:  draft.pageAccess === null ? null : [...draft.pageAccess],
    };

    try {
      if (draft.id) {
        await updateRole.mutateAsync({ roleId: draft.id, input });
        toast.success(`${name} updated`);
      } else {
        await createRole.mutateAsync(input);
        toast.success(`${name} created`);
      }
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save role');
    }
  };

  const remove = async (role: WorkspaceRole) => {
    const warning = role.member_count > 0
      ? `${role.member_count} member${role.member_count === 1 ? '' : 's'} hold this role. They will fall back to their built-in role. Delete “${role.name}”?`
      : `Delete “${role.name}”?`;
    if (!confirm(warning)) return;
    try {
      await deleteRole.mutateAsync(role.id);
      toast.success('Role deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete role');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <ShieldPlus className="h-4 w-4 text-brand-600" /> Custom roles
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Build a role once, then assign it to anyone. Permissions are enforced on
            every request, not just hidden in the menu.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setDraft(emptyDraft())}>
          <Plus className="h-3.5 w-3.5" /> New role
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">No custom roles yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Everyone uses a built-in role. Create one to tailor access to how your team works.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{role.name}</p>
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Users2 className="h-3 w-3" /> {role.member_count}
                    </Badge>
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
                    {' · '}
                    {role.page_access === null
                      ? 'all pages'
                      : `${role.page_access.length} page${role.page_access.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => setDraft(draftFrom(role))}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => void remove(role)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit role' : 'New role'}</DialogTitle>
            <DialogDescription>
              Pick what holders of this role can do and which pages they can open.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="role-name">Name</Label>
                  <Input id="role-name" value={draft.name} placeholder="Sales Executive"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role-desc">Description</Label>
                  <Input id="role-desc" value={draft.description} placeholder="Works leads, no billing"
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p} className="flex items-start gap-2 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={draft.permissions.has(p)} onCheckedChange={() => togglePermission(p)} />
                      <span className="text-xs leading-snug text-foreground">{PERMISSION_LABELS[p]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Pages</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={draft.pageAccess === null}
                      onCheckedChange={(c) => setDraft({ ...draft, pageAccess: c ? null : new Set() })}
                    />
                    Allow every page
                  </label>
                </div>
                {draft.pageAccess === null ? (
                  <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">
                    Holders of this role can open every page. Uncheck above to pick pages.
                  </p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
                    {AGENT_RESTRICTABLE_PAGES.map((page) => (
                      <label key={page.key} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 cursor-pointer hover:bg-accent">
                        <Checkbox
                          checked={draft.pageAccess!.has(page.key)}
                          onCheckedChange={() => togglePage(page.key)}
                        />
                        <span className="text-xs text-foreground">{page.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Dashboard, Conversations and Contacts are always available — nobody can be
                  cut off from their own inbox.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" onClick={() => void save()}
              disabled={createRole.isPending || updateRole.isPending}>
              {draft?.id ? 'Save changes' : 'Create role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
