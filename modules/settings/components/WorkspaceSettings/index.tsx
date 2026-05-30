'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceStore } from '@/store/workspace.store';
import { createClient } from '@/services/supabase/client';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(2).max(100),
});
type FormValues = z.infer<typeof schema>;

export function WorkspaceSettings() {
  const workspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { name: workspace?.name ?? '' },
    });

  const onSubmit = async (values: FormValues) => {
    if (!workspace) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { error } = await supabase
      .from('workspaces')
      .update({ name: values.name })
      .eq('id', workspace.id);
    if (error) {
      toast.error('Failed to update workspace');
    } else {
      setActiveWorkspace({ ...workspace, name: values.name });
      toast.success('Workspace updated');
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Workspace</h2>
        <p className="text-sm text-muted-foreground">Update your workspace name and details.</p>
      </div>
      <Separator />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Workspace Name</Label>
          <Input id="ws-name" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>URL Slug</Label>
          <Input value={workspace?.slug ?? ''} disabled className="bg-muted font-mono text-sm" />
          <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Input value={workspace?.plan ?? 'starter'} disabled className="bg-muted text-sm capitalize" />
        </div>
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}
