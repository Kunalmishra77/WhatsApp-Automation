'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, CheckCircle2, Loader2, User, Phone, Mail, AlignLeft, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface FlowsNativeTemplate {
  key: string;
  name: string;
}

interface FlowsNativePublished {
  id: string;
  template_key: string;
  meta_flow_id: string | null;
  name: string;
  status: string;
  updated_at: string;
}

interface FlowsNativeListResponse {
  templates: FlowsNativeTemplate[];
  published: FlowsNativePublished[];
}

// MVP: only the "Lead Capture" template exists (lib/native-flows.ts). This is a
// static UI summary of its fields — it mirrors buildLeadCaptureFlowJson() so
// the admin can see what the form collects without opening WhatsApp.
const TEMPLATE_FIELDS: Record<string, Array<{ label: string; icon: React.ElementType; required?: boolean }>> = {
  lead_capture: [
    { label: 'Full name', icon: User, required: true },
    { label: 'Phone',     icon: Phone },
    { label: 'Email',     icon: Mail },
    { label: 'Interest',  icon: AlignLeft },
  ],
};

/**
 * "WhatsApp Forms" — management UI for native (non-endpoint) Meta WhatsApp
 * Flows. Distinct from the homegrown "Chatbot Flows" builder (visual
 * automation canvas) and the conversational "WA Forms" (multi-step Q&A sent
 * as plain text messages) — this publishes an actual native WhatsApp Flow UI
 * that opens inside the chat.
 */
export function WhatsAppForms() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();
  const [publishingKey, setPublishingKey] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['flows-native', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/flows-native?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error('Failed to load forms');
      return res.json() as Promise<FlowsNativeListResponse>;
    },
    enabled: !!workspaceId,
  });

  const templates = data?.templates ?? [];
  const published = data?.published ?? [];

  const handlePublish = async (templateKey: string) => {
    setPublishingKey(templateKey);
    try {
      const res = await fetch('/api/flows-native/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, templateKey }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !result.ok) throw new Error(result.error ?? 'Failed to publish form');
      toast.success('Form published to WhatsApp!');
      void queryClient.invalidateQueries({ queryKey: ['flows-native', workspaceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish form');
    } finally {
      setPublishingKey(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold">WhatsApp Forms</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Native WhatsApp Flow forms — a rich, in-chat form UI (not a plain text Q&A). Publish a
          form once, then send it from any conversation.
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading forms…</div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load forms. Try refreshing the page.
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No form templates available</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((template) => {
            const record = published.find((p) => p.template_key === template.key);
            const isPublished = record?.status === 'published' && !!record.meta_flow_id;
            const fields = TEMPLATE_FIELDS[template.key] ?? [];
            const isPublishing = publishingKey === template.key;

            return (
              <Card key={template.key}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-5 pb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                      <ClipboardList className="h-5 w-5 text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{template.name}</p>
                        {isPublished ? (
                          <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Published
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            Not published
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Collects a short contact form directly inside WhatsApp.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-brand-500 hover:bg-brand-600 shrink-0"
                    disabled={isPublishing || isPublished}
                    onClick={() => void handlePublish(template.key)}
                  >
                    {isPublishing ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Publishing…</>
                    ) : isPublished ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" /> Published ✓</>
                    ) : (
                      'Publish'
                    )}
                  </Button>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <div className="flex gap-1.5 flex-wrap">
                    {fields.map((f) => (
                      <span key={f.label} className="flex items-center gap-1 text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        <f.icon className="h-2.5 w-2.5" /> {f.label}{f.required ? ' *' : ''}
                      </span>
                    ))}
                  </div>
                  {isPublished && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Send it from any conversation using <strong>Send form</strong> in the composer's dropdown menu.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
