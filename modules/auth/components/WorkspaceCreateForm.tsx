'use client';

import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createWorkspaceAction } from '@/app/actions/workspace.actions';
import type { AuthActionResult } from '@/modules/auth/types';

const initialState: AuthActionResult = { success: false };

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);
}

export function WorkspaceCreateForm() {
  const [state, formAction, isPending] = useActionState(createWorkspaceAction, initialState);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!state.success && state.error) toast.error(state.error);
  }, [state]);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugTouched) setSlug(toSlug(e.target.value));
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Acme Corp"
          required
          className="h-11"
          onChange={handleNameChange}
        />
        <p className="text-caption text-muted-foreground">
          The name your team will see.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Workspace URL</Label>
        <div className="flex">
          <span className="inline-flex h-11 items-center rounded-l-md border border-r-0 border-border bg-muted px-3 text-body-md text-muted-foreground select-none">
            agentix.io/
          </span>
          <Input
            id="slug"
            name="slug"
            type="text"
            placeholder="acme-corp"
            required
            value={slug}
            className="h-11 rounded-l-none"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(toSlug(e.target.value));
            }}
          />
        </div>
        <p className="text-caption text-muted-foreground">
          Lowercase letters, numbers, and hyphens only.
        </p>
      </div>

      {!state.success && state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-label text-destructive">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        className="h-11 w-full bg-brand-500 font-medium text-white hover:bg-brand-600"
        disabled={isPending}
      >
        {isPending ? 'Creating workspace…' : 'Create workspace'}
      </Button>
    </form>
  );
}
