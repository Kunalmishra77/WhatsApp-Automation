'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useFlows, useCreateFlow, useDeleteFlow, useUpdateFlow } from '@/modules/flows/hooks/useFlows';
import type { ChatbotFlow } from '@/modules/flows/types';

export default function FlowsPage() {
  const router = useRouter();
  const { data: flows = [], isLoading } = useFlows();
  const createFlow  = useCreateFlow();
  const deleteFlow  = useDeleteFlow();
  const updateFlow  = useUpdateFlow();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      const flow = await createFlow.mutateAsync(`New Flow ${Date.now()}`);
      router.push(`/flows/${flow.id}`);
    } catch (err) {
      console.error('[FlowsPage] create error', err);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteFlow.mutateAsync(deletingId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <GitBranch className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Chatbot Flows</h1>
            <p className="text-xs text-muted-foreground">Automate conversations with visual flow builder</p>
          </div>
        </div>
        <Button onClick={handleCreate} disabled={createFlow.isPending} className="gap-2">
          <Plus className="h-4 w-4" />
          New Flow
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-muted-foreground text-sm">Loading flows...</p>
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4 text-center">
            <GitBranch className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium text-foreground">No flows yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create a chatbot flow to automate your conversations</p>
            </div>
            <Button onClick={handleCreate} disabled={createFlow.isPending} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create your first flow
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Nodes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.map((flow: ChatbotFlow) => (
                <TableRow key={flow.id}>
                  <TableCell className="font-medium">{flow.name}</TableCell>
                  <TableCell>
                    <span className="text-xs capitalize bg-muted px-2 py-0.5 rounded">
                      {flow.trigger_type === 'keyword'
                        ? `Keyword: ${flow.trigger_value ?? '—'}`
                        : 'First Message'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={flow.is_active}
                        disabled={updateFlow.isPending}
                        onCheckedChange={(val) =>
                          void updateFlow.mutateAsync({ id: flow.id, patch: { is_active: val } })
                        }
                      />
                      <Badge
                        variant="outline"
                        className={flow.is_active
                          ? 'text-emerald-600 border-emerald-300'
                          : 'text-gray-500 border-gray-300'}
                      >
                        {flow.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{(flow.nodes ?? []).length}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(flow.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => router.push(`/flows/${flow.id}`)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeletingId(flow.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Flow</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The flow and all its sessions will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteFlow.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
