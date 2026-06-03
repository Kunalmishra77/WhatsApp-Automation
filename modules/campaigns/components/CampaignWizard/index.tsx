'use client';

import { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Check, ChevronRight, Paperclip, X, Loader2 as Spin, FlaskConical,
  ImageIcon, Video, FileText, AlertTriangle, Clock, RotateCcw,
} from 'lucide-react';
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
  templateIdB:   string;
  abTest:        boolean;
  audienceType:  'all' | 'tag' | 'tags';
  audienceTag:   string;
  audienceTags:  string;
  scheduledAt:   string;
  mediaId:       string;
  mediaType:     string;
  mediaFileName: string;
}

interface MediaLibraryItem {
  id: string;
  filename: string;
  media_id: string;
  media_type: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

interface CampaignWizardProps {
  open: boolean;
  onClose: () => void;
}

const HEADER_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  IMAGE:    { label: 'Image',    icon: <ImageIcon className="h-3 w-3" />,  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  VIDEO:    { label: 'Video',    icon: <Video className="h-3 w-3" />,      color: 'bg-purple-100 text-purple-700 border-purple-200' },
  DOCUMENT: { label: 'Document', icon: <FileText className="h-3 w-3" />,   color: 'bg-orange-100 text-orange-700 border-orange-200' },
  TEXT:     { label: 'Text',     icon: null,                                color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function mediaHeaderType(template: { header_type?: string | null } | undefined): string | null {
  const t = template?.header_type?.toUpperCase();
  if (t && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t)) return t;
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function CampaignWizard({ open, onClose }: CampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    name: '', templateId: '', templateIdB: '', abTest: false,
    audienceType: 'all', audienceTag: '', audienceTags: '', scheduledAt: '',
    mediaId: '', mediaType: '', mediaFileName: '',
  });
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [recentMedia, setRecentMedia]           = useState<MediaLibraryItem[]>([]);
  const [loadingRecent, setLoadingRecent]       = useState(false);
  const mediaInputRef   = useRef<HTMLInputElement>(null);
  const workspaceId     = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const { data: templates = [] } = useTemplates();
  const create = useCreateCampaign();

  const selectedTemplate  = templates.find((t) => t.id === state.templateId);
  const reqMediaType      = mediaHeaderType(selectedTemplate);   // 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
  const templateNeedsMedia = !!reqMediaType;
  const progress = ((step + 1) / STEPS.length) * 100;

  // Load recent media when entering step 4
  useEffect(() => {
    if (step !== 4 || !workspaceId) return;
    setLoadingRecent(true);
    fetch(`/api/campaigns/upload-media?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { items?: MediaLibraryItem[] }) => setRecentMedia(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingRecent(false));
  }, [step, workspaceId]);

  const canProceed = () => {
    if (step === 0) return state.name.trim().length > 0;
    // If template requires media header, must have media before creating
    if (step === 4 && templateNeedsMedia && !state.mediaId) return false;
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
      try { data = await res.json() as typeof data; } catch { /* non-JSON */ }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed — check WhatsApp credentials in Settings');
      setState((s) => ({ ...s, mediaId: data.mediaId ?? '', mediaType: data.mediaType ?? '', mediaFileName: data.fileName ?? file.name }));
      toast.success('Media uploaded!');
      // Refresh recent list
      fetch(`/api/campaigns/upload-media?workspaceId=${workspaceId}`)
        .then((r) => r.json())
        .then((d: { items?: MediaLibraryItem[] }) => setRecentMedia(d.items ?? []))
        .catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingMedia(false);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
  };

  const selectFromLibrary = (item: MediaLibraryItem) => {
    setState((s) => ({
      ...s,
      mediaId:       item.media_id,
      mediaType:     item.media_type,
      mediaFileName: item.filename,
    }));
    toast.success(`Selected: ${item.filename}`);
  };

  const handleCreate = async () => {
    try {
      const audienceFilter = state.audienceType === 'tag'
        ? { tag: state.audienceTag }
        : state.audienceType === 'tags'
          ? { tags: state.audienceTags.split(',').map((t) => t.trim()).filter(Boolean) }
          : {};

      if (state.abTest) {
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

        toast.success('A/B campaign created!');
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

  const approvedTemplates = templates.filter((t) => t.status === 'approved');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Campaign</DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                  i < step  && 'bg-brand-500 text-white',
                  i === step && 'bg-brand-500 text-white ring-2 ring-brand-500/30',
                  i > step  && 'bg-muted text-muted-foreground',
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

        <div className="min-h-[100px] max-h-[56vh] overflow-y-auto py-2 pr-1 space-y-0">

          {/* ── Step 0: Name & Setup ─────────────────────────────────── */}
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
              <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">A/B Test</p>
                    <p className="text-xs text-muted-foreground">Send 2 versions, compare performance</p>
                  </div>
                </div>
                <Switch checked={state.abTest} onCheckedChange={(v) => setState((s) => ({ ...s, abTest: v }))} />
              </div>
              {state.abTest && (
                <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  🧪 You&apos;ll select <strong>Template A</strong> in the next step, then <strong>Template B</strong> after.
                </p>
              )}
            </div>
          )}

          {/* ── Step 1: Select Template ──────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Template <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                {state.templateId && (
                  <button
                    onClick={() => setState((s) => ({ ...s, templateId: '', mediaId: '', mediaType: '', mediaFileName: '' }))}
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Templates are required for cold contacts (no 24-hr session).
              </p>

              {/* No template option */}
              <button
                onClick={() => setState((s) => ({ ...s, templateId: '', mediaId: '', mediaType: '', mediaFileName: '' }))}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition-colors',
                  !state.templateId ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-300',
                )}
              >
                <p className="text-sm font-medium text-muted-foreground">🚫 No template — media only</p>
                <p className="text-xs text-muted-foreground mt-0.5">Only reaches contacts with active 24-hr session</p>
              </button>

              {approvedTemplates.map((t) => {
                const ht   = t.header_type?.toUpperCase() as string | undefined;
                const meta = ht && ht !== 'NONE' ? HEADER_TYPE_META[ht] : null;
                const needsMedia = ht && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(ht);
                return (
                  <button
                    key={t.id}
                    onClick={() => setState((s) => ({ ...s, templateId: t.id }))}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      state.templateId === t.id ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-300',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium font-mono flex-1 truncate">{t.name}</p>
                      {meta && (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border', meta.color)}>
                          {meta.icon}{meta.label}
                        </span>
                      )}
                      {needsMedia && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                          <AlertTriangle className="h-2.5 w-2.5" />Media required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
                  </button>
                );
              })}

              {approvedTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No approved templates yet.</p>
              )}

              {/* A/B Version B */}
              {state.abTest && (
                <div className="mt-4 space-y-2 border-t border-dashed border-purple-200 pt-4">
                  <p className="text-xs font-semibold text-purple-700">Version B Template</p>
                  {approvedTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setState((s) => ({ ...s, templateIdB: t.id }))}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        state.templateIdB === t.id ? 'border-purple-500 bg-purple-500/5' : 'border-border hover:border-purple-300',
                      )}
                    >
                      <p className="text-sm font-medium font-mono">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.body}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Audience ─────────────────────────────────────── */}
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
                  <Input id="tag" value={state.audienceTag} onChange={(e) => setState((s) => ({ ...s, audienceTag: e.target.value }))} placeholder="e.g. vip" />
                  <p className="text-[11px] text-muted-foreground">Sends to all contacts with this exact tag.</p>
                </div>
              )}

              {state.audienceType === 'tags' && (
                <div className="space-y-1.5">
                  <Label>Tags (comma separated)</Label>
                  <Input value={state.audienceTags} onChange={(e) => setState((s) => ({ ...s, audienceTags: e.target.value }))} placeholder="e.g. vip, premium, leads" />
                  <p className="text-[11px] text-muted-foreground">Sends to contacts with ANY of these tags.</p>
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

          {/* ── Step 3: Schedule ─────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-3">
              <Label>Schedule (optional)</Label>
              <p className="text-xs text-muted-foreground">Leave empty to save as draft.</p>
              <Input type="datetime-local" value={state.scheduledAt} onChange={(e) => setState((s) => ({ ...s, scheduledAt: e.target.value }))} />
            </div>
          )}

          {/* ── Step 4: Media ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Header — required vs optional label */}
              <div>
                <div className="flex items-center gap-2">
                  <Label>
                    {templateNeedsMedia ? 'Header Media' : 'Attach Media'}
                  </Label>
                  {templateNeedsMedia ? (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Required</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Optional</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {templateNeedsMedia
                    ? `Your selected template has a ${reqMediaType?.toLowerCase()} header — you must upload or select a ${reqMediaType?.toLowerCase()} below before the campaign can be sent.`
                    : 'Image / video / PDF sent after the template. Only reaches contacts with an active 24-hr session.'}
                </p>
              </div>

              {/* Required warning banner */}
              {templateNeedsMedia && !state.mediaId && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    <strong>Template &quot;{selectedTemplate?.name}&quot;</strong> requires a {reqMediaType?.toLowerCase()} header.
                    Upload a new file or pick from Recent Uploads below.
                  </p>
                </div>
              )}

              {/* Currently selected media */}
              {state.mediaId ? (
                <div className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 p-3">
                  <Paperclip className="h-4 w-4 text-brand-600 shrink-0" />
                  <span className="flex-1 text-sm text-brand-700 truncate">{state.mediaFileName}</span>
                  <button onClick={() => setState((s) => ({ ...s, mediaId: '', mediaType: '', mediaFileName: '' }))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={isUploadingMedia}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-5 text-sm text-muted-foreground hover:border-brand-300 hover:text-brand-600 transition-colors disabled:opacity-50"
                >
                  {isUploadingMedia
                    ? <><Spin className="h-4 w-4 animate-spin" /> Uploading…</>
                    : <><Paperclip className="h-4 w-4" /> Click to upload image / video / PDF</>}
                </button>
              )}

              <input
                ref={mediaInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMediaUpload(f); }}
              />

              {/* Recent Uploads */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Recent Uploads</span>
                  {loadingRecent && <Spin className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>

                {!loadingRecent && recentMedia.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1">No recent uploads. Upload a file above — it will appear here for reuse.</p>
                )}

                <div className="space-y-1.5">
                  {recentMedia.map((item) => {
                    const isSelected = state.mediaId === item.media_id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => selectFromLibrary(item)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                          isSelected
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-border hover:border-brand-300 hover:bg-muted/30',
                        )}
                      >
                        {/* Type icon */}
                        <div className="shrink-0 h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                          {item.media_type === 'image'    && <ImageIcon className="h-4 w-4 text-blue-500" />}
                          {item.media_type === 'video'    && <Video className="h-4 w-4 text-purple-500" />}
                          {item.media_type === 'document' && <FileText className="h-4 w-4 text-orange-500" />}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{item.filename}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatBytes(item.file_size)} · {timeAgo(item.created_at)}
                          </p>
                        </div>
                        {/* Reuse / selected indicator */}
                        {isSelected ? (
                          <Check className="h-4 w-4 text-brand-500 shrink-0" />
                        ) : (
                          <span className="text-[10px] text-brand-600 font-medium shrink-0 flex items-center gap-0.5">
                            <RotateCcw className="h-3 w-3" /> Reuse
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Review ───────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-3 text-sm">
              {templateNeedsMedia && !state.mediaId && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700">
                    Template requires a {reqMediaType?.toLowerCase()} header — go back and upload one.
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <Row label="Name"     value={state.name} />
                <Row label="Template" value={selectedTemplate?.name ?? '—'} mono />
                {selectedTemplate?.header_type && selectedTemplate.header_type !== 'NONE' && (
                  <Row label="Header type" value={selectedTemplate.header_type} />
                )}
                <Row label="Header media" value={state.mediaFileName || (templateNeedsMedia ? '⚠️ Missing!' : '—')} />
                <Row
                  label="Audience"
                  value={
                    state.audienceType === 'all'  ? 'All Contacts' :
                    state.audienceType === 'tag'  ? `Tag: ${state.audienceTag}` :
                    `Tags: ${state.audienceTags}`
                  }
                />
                <Row label="Schedule" value={state.scheduledAt ? new Date(state.scheduledAt).toLocaleString() : 'Draft'} />
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
            <Button
              disabled={create.isPending || (templateNeedsMedia && !state.mediaId)}
              onClick={() => void handleCreate()}
            >
              {create.isPending ? 'Creating…' : 'Create Campaign'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('font-medium text-right truncate', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}
