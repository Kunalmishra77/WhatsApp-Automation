'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CustomFieldDef {
  id: string;
  name: string;
  label: string;
  field_type: string;
  options: string[] | null;
  created_at: string;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text:   'Text',
  number: 'Number',
  date:   'Date',
  select: 'Select (dropdown)',
};

export function CustomFieldSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();
  const [label, setLabel]         = useState('');
  const [fieldType, setFieldType] = useState<string>('text');
  const [optionsStr, setOptionsStr] = useState('');

  const { data: fields = [], isLoading } = useQuery<CustomFieldDef[]>({
    queryKey: ['custom-fields', workspaceId],
    queryFn:  () => fetch(`/api/custom-fields?workspaceId=${workspaceId}`).then((r) => r.json() as Promise<CustomFieldDef[]>),
    enabled:  !!workspaceId,
  });

  const create = useMutation({
    mutationFn: () => {
      const options = fieldType === 'select'
        ? optionsStr.split(',').map((o) => o.trim()).filter(Boolean)
        : undefined;
      return fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name: label.trim(), label: label.trim(), field_type: fieldType, options }),
      }).then((r) => r.json());
    },
    onSuccess: (data: { error?: string }) => {
      if (data.error) { toast.error(data.error); return; }
      void queryClient.invalidateQueries({ queryKey: ['custom-fields', workspaceId] });
      setLabel('');
      setOptionsStr('');
      setFieldType('text');
      toast.success('Custom field created');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/custom-fields?id=${id}&workspaceId=${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['custom-fields', workspaceId] });
      toast.success('Field deleted');
    },
  });

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Custom Contact Fields</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Add extra fields to contacts — Industry, Plan Type, Company Size, etc.
        </p>
      </div>

      {/* Create new */}
      <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
        <p className="text-sm font-medium">New Field</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="field-label">Field Label</Label>
            <Input
              id="field-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Company Size"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={fieldType} onValueChange={setFieldType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([val, lbl]) => (
                  <SelectItem key={val} value={val}>{lbl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {fieldType === 'select' && (
          <div className="space-y-1.5">
            <Label htmlFor="field-options">Options (comma-separated)</Label>
            <Input
              id="field-options"
              value={optionsStr}
              onChange={(e) => setOptionsStr(e.target.value)}
              placeholder="Small, Medium, Large"
            />
          </div>
        )}
        <Button
          onClick={() => void create.mutate()}
          disabled={!label.trim() || create.isPending}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add Field
        </Button>
      </div>

      {/* Existing fields */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{fields.length} field{fields.length !== 1 ? 's' : ''}</p>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No custom fields yet. Create your first field above.
          </div>
        ) : (
          fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">
                  {FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                  {f.options?.length ? ` — ${f.options.join(', ')}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => void remove.mutate(f.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
