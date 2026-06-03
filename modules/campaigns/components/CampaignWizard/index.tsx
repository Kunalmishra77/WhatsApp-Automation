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
import { Check, ChevronRight, Paperclip, X, Loader2 as Spin, FlaskConical } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTemplates } from '@/modules/templates/hooks/useTemplates';
import { useCreateCampaign } from '../../hooks/useCampaigns';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

const STEPS = ['Name & Setup', 'Select Template', 'Audience', 'Schedule', 'Media', 'Review'];

interface WizardState {
  name:          string;
  templateId:    string;
  templateIdB:   string;  // A/B version B template
  abTest:        boolean;
  audienceType:  'all' | 'tag' | 'tags';
  audienceTag:   string;
  audienceTags:  string;
  scheduledAt:   string;
  mediaId:       string;
  mediaType:     string;
  mediaFileName: string;
}

interface CampaignWizardProps {
  open: boolean;
  onClose: () => void;
}

export function CampaignWizard({ open, onClose }: CampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    name: '', templateId: '', templateIdB: '', abTest: false,
    audienceType: 'all', audienceTag: '', audienceTags: '', scheduledAt: '',
    mediaId: '', mediaType: '', mediaFileName: '',
  });
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const workspaceId   = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const { data: templates = [] } = useTemplates();
  const create = useCreateCampaign();

  const selectedTemplate = templates.find((t) => t.id === state.templateId);
  const progress = ((step + 1) / STEPS.length) * 100;

  const canProceed = () => {
    if (step === 0) return state.name.trim().length > 0;
    // Step 5 (Review): need at least template OR media selected
    if (step === 5) return !!(state.templateId || state.mediaId);
    return true;
  };

  const handleMediaUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingMedia(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('workspaceId', workspaceId);
      const res  = await fetch('/api/campaigns/upload-media', { method: 'POST', body: form });
      let data: { mediaId?: string; mediaType?: string; fileName?: string; error?: string } = {};
      try { data = await res.json() as typeof data; } catch { /* non-JSON response */ }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed — check WhatsApp credentials in Settings');
      setState((s) => ({ ...s, mediaId: data.mediaId ?? '', mediaType: data.mediaType ?? '', mediaFileName: data.fileName ?? file.name }));
      toast.success('Media uploaded!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingMedia(false);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
  };

  const handleCreate = async () => {
    try {
      const audienceFilter = state.audienceType === 'tag'
        ? { tag: state.audienceTag }
        : state.audienceType === 'tags'
          ? { tags: state.audienceTags.split(',').map((t) => t.trim()).filter(Boolean) }
          : {};

      if (state.abTest) {
        // Create Version A
        const campA = await create.mutateAsync({
          name:            `${state.name} — Version A`,
          template_id:     state.templateId,
          audience_type:   state.audienceType,
          audience_filter: audienceFilter,
          scheduled_at:    state.scheduledAt || undefined,
          media_id:        state.mediaId || undefined,
          media_type:      state.mediaType || undefined,
          ab_test_group:   'A',
        } as Parameters<typeof create.mutateAsync>[0]);

        // Create Version B linked to A
        await create.mutateAsync({
          name:               `${state.name} — Version B`,
          template_id:        state.templateIdB || state.templateId,
          audience_type:      state.audienceType,
          audience_filter:    audienceFilter,
          scheduled_at:       state.scheduledAt || undefined,
          media_id:           state.mediaId || undefined,
          media_type:         state.mediaType || undefined,
          ab_test_group:      'B',
          parent_campaign_id: (campA as any).id,
        } as Parameters<typeof create.mutateAsync>[0]);

        toast.success('A/B campaign created! Two versions ready to launch.');
      } else {
        await create.mutateAsync({
          name:            state.name,
          template_id:     state.templateId,
          audience_type:   state.audienceType,
          audience_filter: audienceFilter,
          scheduled_at:    state.scheduledAt || undefined,
          media_id:        state.mediaId   || undefined,
          media_type:      state.mediaType || undefined,
        } as Parameters<typeof create.mutateAsync>[0]);
        toast.success('Campaign created!');
      }

      setStep(0);
      setState({ name: '', templateId: '', templateIdB: '', abTest: false, audienceType: 'all', audienceTag: '', audienceTags: '', scheduledAt: '', mediaId: '', mediaType: '', mediaFileName: '' });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  };

  const handleClose = () => {
    setStep(0);
    setState({ name: '', templateId: '', templateIdB: '', abTest: false, audienceType: 'all', audienceTag: '', audienceTags: '', scheduledAt: '', mediaId: '', mediaType: '', mediaFileName: '' });
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

        <div className="min-h-[100px] max-h-[52vh] overflow-y-auto py-2 pr-1">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Campaign Name</Label>
                <Input
                  id="camp-name"
                  value={state.name}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Black Friday Promo 2026"
                />
              </div>
              {/* A/B Test Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">A/B Test</p>
                    <p className="text-xs text-muted-foreground">Send 2 versions, compare performance</p>
                  </div>
                </div>
                <Switch
                  checked={state.abTest}
                  onCheckedChange={(v) => setState((s) => ({ ...s, abTest: v }))}
                />
              </div>
              {state.abTest && (
                <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  🧪 You&apos;ll select <strong>Template A</strong> in the next step, then <strong>Template B</strong> after. Both versions will be created for the same audience.
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Template <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                {state.templateId && (
                  <button
                    onClick={() => setState((s) => ({ ...s, templateId: '' }))}
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Skip if you only want to send media. Templates are required for cold contacts (no 24-hr session).
              </p>

              {/* No template option */}
              <button
                onClick={() => setState((s) => ({ ...s, templateId: '' }))}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition-colors',
                  !state.templateId
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-border hover:border-brand-300',
                )}
              >
                <p className="text-sm font-medium text-muted-foreground">🚫 No template — media only</p>
                <p className="text-xs text-muted-foreground mt-0.5">Only reaches contacts with active 24-hr session</p>
              </button>

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
              {templates.filter((t) => t.status === 'approved').length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No approved templates yet. You can still proceed with media only.</p>
              )}
              {state.abTest && (
                <p className="text-[11px] text-purple-600 font-medium">⬆️ This is Version A template</p>
              )}
            </div>
          )}

          {/* A/B Version B template selection — only when abTest is on and we're on a "virtual" step 1.5 */}
          {step === 1 && state.abTest && false /* Handled inline via templateIdB below */ && null}

          {/* A/B Version B — shown as an overlay section within step 1 when abTest active */}
          {step === 1 && state.abTest && (
            <div className="mt-4 space-y-2 border-t border-dashed border-purple-200 pt-4">
              <p className="text-xs font-semibold text-purple-700">Version B Template</p>
              {templates.filter((t) => t.status === 'approved').map((t) => (
                <button
                  key={t.id}
                  onClick={() => setState((s) => ({ ...s, templateIdB: t.id }))}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    state.templateIdB === t.id
                      ? 'border-purple-500 bg-purple-500/5'
                      : 'border-border hover:border-purple-300',
                  )}
                >
                  <p className="text-sm font-medium font-mono">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.body}</p>
                </button>
              ))}
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
            <div className="space-y-3">
              <div>
                <Label>Attach Media (Optional)</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Image / video / PDF sent after the template. Only reaches contacts with an active 24-hr session.
                </p>
              </div>
              {state.mediaId ? (
                <div className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 p-3">
                  <Paperclip className="h-4 w-4 text-brand-600 shrink-0" />
                  <span className="flex-1 text-sm text-brand-700 truncate">{state.mediaFileName}</span>
                  <button
                    onClick={() => setState((s) => ({ ...s, mediaId: '', mediaType: '', mediaFileName: '' }))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={isUploadingMedia}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:border-brand-300 hover:text-brand-600 transition-colors disabled:opacity-50"
                >
                  {isUploadingMedia
                    ? <><Spin className="h-4 w-4 animate-spin" /> Uploading…</>
                    : <><Paperclip className="h-4 w-4" /> Click to attach image / video / PDF</>}
                </button>
              )}
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMediaUpload(f); }}
              />
            </div>
          )}

          {step === 5 && (
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
                <div className="flex justify-between"><span className="text-muted-foreground">Media</span><span className="font-medium">{state.mediaFileName || '—'}</span></div>
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
