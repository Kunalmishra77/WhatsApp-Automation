'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTemplates } from '@/modules/templates/hooks/useTemplates';
import { useCreateCampaign } from '../../hooks/useCampaigns';
import { toast } from 'sonner';

const STEPS = ['Name & Setup', 'Select Template', 'Audience', 'Schedule', 'Review'];

interface WizardState {
  name:          string;
  templateId:    string;
  audienceType:  'all' | 'tag' | 'tags';
  audienceTag:   string;
  audienceTags:  string; // comma-separated
  scheduledAt:   string;
}

interface CampaignWizardProps {
  open: boolean;
  onClose: () => void;
}

export function CampaignWizard({ open, onClose }: CampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    name: '', templateId: '', audienceType: 'all', audienceTag: '', audienceTags: '', scheduledAt: '',
  });
  const { data: templates = [] } = useTemplates();
  const create = useCreateCampaign();

  const selectedTemplate = templates.find((t) => t.id === state.templateId);
  const progress = ((step + 1) / STEPS.length) * 100;

  const canProceed = () => {
    if (step === 0) return state.name.trim().length > 0;
    if (step === 1) return !!state.templateId;
    return true;
  };

  const handleCreate = async () => {
    try {
      await create.mutateAsync({
        name:            state.name,
        template_id:     state.templateId,
        audience_type:   state.audienceType,
        audience_filter: state.audienceType === 'tag'
          ? { tag: state.audienceTag }
          : state.audienceType === 'tags'
            ? { tags: state.audienceTags.split(',').map((t) => t.trim()).filter(Boolean) }
            : {},
        scheduled_at:    state.scheduledAt || undefined,
      });
      toast.success('Campaign created successfully!');
      setStep(0);
      setState({ name: '', templateId: '', audienceType: 'all', audienceTag: '', audienceTags: '', scheduledAt: '' });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  };

  const handleClose = () => {
    setStep(0);
    setState({ name: '', templateId: '', audienceType: 'all', audienceTag: '', audienceTags: '', scheduledAt: '' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                  i < step && 'bg-brand-500 text-white',
                  i === step && 'bg-brand-500 text-white ring-2 ring-brand-500/30',
                  i > step && 'bg-muted text-muted-foreground',
                )}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span className={cn('text-[10px] hidden sm:block', i === step ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-40 py-2">
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Campaign Name</Label>
                <Input
                  id="camp-name"
                  value={state.name}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Black Friday Promo 2026"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Label>Select Template</Label>
              {templates.filter((t) => t.status === 'approved').length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved templates yet. Create and wait for Meta approval first.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {templates.filter((t) => t.status === 'approved').map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setState((s) => ({ ...s, templateId: t.id }))}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        state.templateId === t.id
                          ? 'border-brand-500 bg-brand-500/5'
                          : 'border-border hover:border-brand-300',
                      )}
                    >
                      <p className="text-sm font-medium font-mono">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Label>Audience Segment</Label>
              <Select
                value={state.audienceType}
                onValueChange={(v) => setState((s) => ({ ...s, audienceType: v as WizardState['audienceType'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌍 All Contacts</SelectItem>
                  <SelectItem value="tag">🏷️ Single Tag</SelectItem>
                  <SelectItem value="tags">🏷️🏷️ Multiple Tags (OR)</SelectItem>
                </SelectContent>
              </Select>

              {state.audienceType === 'tag' && (
                <div className="space-y-1.5">
                  <Label htmlFor="tag">Tag Name</Label>
                  <Input
                    id="tag"
                    value={state.audienceTag}
                    onChange={(e) => setState((s) => ({ ...s, audienceTag: e.target.value }))}
                    placeholder="e.g. vip"
                  />
                  <p className="text-[11px] text-muted-foreground">Sends to all contacts with this exact tag.</p>
                </div>
              )}

              {state.audienceType === 'tags' && (
                <div className="space-y-1.5">
                  <Label>Tags (comma separated)</Label>
                  <Input
                    value={state.audienceTags}
                    onChange={(e) => setState((s) => ({ ...s, audienceTags: e.target.value }))}
                    placeholder="e.g. vip, premium, leads"
                  />
                  <p className="text-[11px] text-muted-foreground">Sends to contacts with ANY of these tags (OR logic).</p>
                  {state.audienceTags && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {state.audienceTags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                        <span key={tag} className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Label>Schedule (optional)</Label>
              <p className="text-xs text-muted-foreground">Leave empty to save as draft.</p>
              <Input
                type="datetime-local"
                value={state.scheduledAt}
                onChange={(e) => setState((s) => ({ ...s, scheduledAt: e.target.value }))}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{state.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Template</span><span className="font-mono text-xs">{selectedTemplate?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Audience</span><span className="font-medium capitalize">
                  {state.audienceType === 'all' && 'All Contacts'}
                  {state.audienceType === 'tag' && `Tag: ${state.audienceTag}`}
                  {state.audienceType === 'tags' && `Tags: ${state.audienceTags}`}
                </span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Schedule</span><span className="font-medium">{state.scheduledAt ? new Date(state.scheduledAt).toLocaleString() : 'Draft'}</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => step === 0 ? handleClose() : setStep((s) => s - 1)}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canProceed()} onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button disabled={create.isPending} onClick={() => void handleCreate()}>
              {create.isPending ? 'Creating…' : 'Create Campaign'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
