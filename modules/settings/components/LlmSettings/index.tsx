'use client';

import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { MODEL_OPTIONS, DEFAULT_LLM_CONFIG, type LlmConfig } from '@/lib/ai-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const TASK_LABELS: Record<keyof LlmConfig, { label: string; description: string }> = {
  auto_reply_model:   { label: 'Auto-Reply',   description: 'Model used for all auto-reply messages' },
  vision_model:       { label: 'Vision (Image)', description: 'Model used when customer sends an image (GPT-4o supports vision)' },
  escalation_model:   { label: 'Escalation',   description: 'Model used for escalation detection + sentiment analysis' },
  embedding_model:    { label: 'Embeddings',   description: 'Model used for Knowledge Base semantic search' },
  fast_model:         { label: 'Fast/Cheap',   description: 'Groq-based model for quick, cost-efficient tasks' },
};

const TIER_COLORS: Record<string, string> = {
  free:     'bg-emerald-100 text-emerald-700',
  standard: 'bg-blue-100 text-blue-700',
  premium:  'bg-purple-100 text-purple-700',
};

export function LlmSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<LlmConfig>({ ...DEFAULT_LLM_CONFIG });

  const { data: ws, isLoading } = useQuery({
    queryKey: ['workspace-settings', workspaceId],
    queryFn:  () =>
      fetch(`/api/settings/workspace?workspaceId=${workspaceId}`)
        .then((r) => r.json() as Promise<{ workspace?: { settings?: Record<string, unknown> } }>),
    enabled: !!workspaceId,
  });

  useEffect(() => {
    if (ws?.workspace?.settings?.llm_config) {
      setConfig({ ...DEFAULT_LLM_CONFIG, ...(ws.workspace.settings.llm_config as Partial<LlmConfig>) });
    }
  }, [ws]);

  const save = useMutation({
    mutationFn: () =>
      fetch('/api/settings/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, settings: { llm_config: config } }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-settings', workspaceId] });
      toast.success('AI model settings saved');
    },
  });

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Cpu className="h-4 w-4 text-purple-500" /> AI Model Routing
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose which AI model handles each task. Groq models are fastest and free. GPT-4o is most capable.
        </p>
      </div>

      <div className="space-y-4">
        {(Object.keys(TASK_LABELS) as Array<keyof LlmConfig>).map((task) => {
          const { label, description } = TASK_LABELS[task];
          const selectedModel = MODEL_OPTIONS.find((m) => m.value === config[task]);
          return (
            <div key={task} className="rounded-xl border border-border p-4 space-y-2 bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                {selectedModel && (
                  <Badge className={`text-[10px] ${TIER_COLORS[selectedModel.tier] ?? ''}`} variant="outline">
                    {selectedModel.tier}
                  </Badge>
                )}
              </div>
              <Select value={config[task]} onValueChange={(v) => setConfig((c) => ({ ...c, [task]: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-muted-foreground ml-2">({m.provider})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <Button onClick={() => void save.mutate()} disabled={save.isPending} className="gap-1.5">
        <Cpu className="h-4 w-4" />
        {save.isPending ? 'Saving…' : 'Save Model Settings'}
      </Button>
    </div>
  );
}
