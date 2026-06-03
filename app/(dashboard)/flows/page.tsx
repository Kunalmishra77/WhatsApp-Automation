'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Plus, Pencil, Trash2, Sparkles, FileText, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import { FLOW_TEMPLATES } from '@/lib/flow-templates';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function FlowsPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const { data: flows = [], isLoading } = useFlows();
  const createFlow  = useCreateFlow();
  const deleteFlow  = useDeleteFlow();
  const updateFlow  = useUpdateFlow();

  const [deletingId, setDeletingId]             = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAIAssistant, setShowAIAssistant]   = useState(false);
  const [aiDescription, setAiDescription]       = useState('');
  const [aiGenerating, setAiGenerating]         = useState(false);

  const handleCreateBlank = async () => {
    setShowTemplatePicker(false);
    try {
      const flow = await createFlow.mutateAsync(`New Flow ${Date.now()}`);
      router.push(`/flows/${flow.id}`);
    } catch (err) {
      console.error('[FlowsPage] create error', err);
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    const tpl = FLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setShowTemplatePicker(false);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: tpl.name,
          description: tpl.description,
          trigger_type: tpl.trigger_type,
          trigger_value: tpl.trigger_value,
          nodes: tpl.nodes,
          edges: tpl.edges,
        }),
      });
      const data = await res.json() as { flow?: ChatbotFlow };
      if (data.flow) router.push(`/flows/${data.flow.id}`);
    } catch (err) {
      console.error('[FlowsPage] template create error', err);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!aiDescription.trim()) return;
    setAiGenerating(true);
    try {
      const res = await fetch('/api/flows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, description: aiDescription }),
      });
      const generated = await res.json() as {
        name?: string; description?: string; trigger_type?: string;
        trigger_value?: string; nodes?: unknown[]; edges?: unknown[];
        error?: string;
      };
      if (!res.ok) throw new Error(generated.error ?? 'AI generation failed');

      // Save generated flow
      const saveRes = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name:          generated.name ?? 'AI Generated Flow',
          description:   generated.description ?? aiDescription,
          trigger_type:  generated.trigger_type ?? 'first_message',
          trigger_value: generated.trigger_value ?? null,
          nodes:         generated.nodes ?? [],
          edges:         generated.edges ?? [],
        }),
      });
      const saveData = await saveRes.json() as { flow?: ChatbotFlow };
      if (!saveData.flow) throw new Error('Failed to save flow');

      toast.success(`Flow "${saveData.flow.name}" generated! Open it to review and edit.`);
      setShowAIAssistant(false);
      setAiDescription('');
      router.push(`/flows/${saveData.flow.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiGenerating(false);
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

  const EXAMPLE_PROMPTS = [
    'Real estate lead nurturing: greet, ask budget and location, if hot (urgent/budget ready) connect to agent, else schedule callback',
    'E-commerce support: ask order issue type, handle returns/shipping/payment separately, escalate unresolved to human',
    'Coaching service: introduce program, ask goal, send relevant content, book discovery call for interested leads',
  ];

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300"
            onClick={() => setShowAIAssistant(true)}
          >
            <Wand2 className="h-4 w-4" />
            Generate with AI
          </Button>
          <Button onClick={() => setShowTemplatePicker(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Flow
          </Button>
        </div>
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
            <div className="flex gap-2">
              <Button onClick={() => setShowAIAssistant(true)} variant="outline" className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50">
                <Wand2 className="h-4 w-4" />
                Generate with AI
              </Button>
              <Button onClick={() => setShowTemplatePicker(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                From template
              </Button>
            </div>
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
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {flow.name}
                      {flow.description?.includes('AI') && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 font-medium">
                          🤖 AI
                        </span>
                      )}
                    </div>
                  </TableCell>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/flows/${flow.id}`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletingId(flow.id)}>
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

      {/* ── AI Assistant Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAIAssistant} onOpenChange={(o) => { if (!o) { setShowAIAssistant(false); setAiDescription(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-purple-500" />
              Generate Flow with AI
            </DialogTitle>
            <DialogDescription>
              Describe how you want to nurture your leads. The AI will build the flow — you can edit it afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder="e.g. Greet the lead, ask their budget and location, if they seem hot (ready to buy) connect them to my sales agent, otherwise send them our brochure and ask to schedule a callback..."
              className="min-h-[120px] resize-none"
              disabled={aiGenerating}
            />

            {/* Example prompts */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">Examples — click to use:</p>
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setAiDescription(p)}
                  className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground border border-border hover:border-purple-300 rounded-lg px-3 py-2 transition-colors line-clamp-2"
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2.5 text-[11px] text-purple-800 space-y-1">
              <p className="font-medium">What AI will create:</p>
              <p>• Welcome message → qualifying questions → condition branches</p>
              <p>• Hot leads → assign to human agent</p>
              <p>• Cold/warm leads → nurture messages + follow-up</p>
              <p>• All nodes are editable after generation</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAIAssistant(false); setAiDescription(''); }}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleGenerateWithAI()}
              disabled={!aiDescription.trim() || aiGenerating}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {aiGenerating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                : <><Wand2 className="h-4 w-4" /> Generate Flow</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Template Picker Dialog ──────────────────────────────────────────── */}
      <Dialog open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Flow</DialogTitle>
            <DialogDescription>Start from a template or build from scratch.</DialogDescription>
          </DialogHeader>

          <button
            onClick={() => void handleCreateBlank()}
            className="flex items-center gap-4 w-full rounded-xl border-2 border-dashed border-border p-4 text-left hover:border-brand-400 hover:bg-brand-50/50 transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 shrink-0">
              <FileText className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="font-medium text-sm">Blank Flow</p>
              <p className="text-xs text-muted-foreground mt-0.5">Start from scratch with an empty canvas</p>
            </div>
          </button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Templates
            </p>
            <div className="grid grid-cols-2 gap-3">
              {FLOW_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => void handleCreateFromTemplate(tpl.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border border-border p-4 text-left',
                    'hover:border-brand-400 hover:bg-brand-50/50 hover:shadow-sm transition-all',
                  )}
                >
                  <span className="text-2xl shrink-0">{tpl.icon}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
                    <span className="mt-2 inline-block text-[10px] bg-muted px-1.5 py-0.5 rounded capitalize">
                      {tpl.trigger_type === 'keyword' ? `keyword: "${tpl.trigger_value}"` : 'first message'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Flow</DialogTitle>
            <DialogDescription>This action cannot be undone. The flow and all its sessions will be permanently deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleteFlow.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
