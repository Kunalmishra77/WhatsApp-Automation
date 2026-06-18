'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Check, ChevronRight, Paperclip, X, Loader2 as Spin, FlaskConical,
  ImageIcon, Video, FileText, AlertTriangle, Clock, RotateCcw, Link,
  Search, Users, Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTemplates } from '@/modules/templates/hooks/useTemplates';
import { useCreateCampaign } from '../../hooks/useCampaigns';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { WhatsAppPreview } from '@/modules/templates/components/WhatsAppPreview';
import { normalizePhone } from '@/lib/phone';

const STEPS = ['Name & Setup', 'Select Template', 'Audience', 'Schedule', 'Review'];

interface WizardState {
  name:               string;
  templateId:         string;
  templateIdB:        string;
  abTest:             boolean;
  audienceType:       'all' | 'tag' | 'tags' | 'contacts' | 'manual';
  audienceTag:        string;
  audienceTags:       string;
  selectedContactIds: string[];   // for 'contacts' mode
  manualPhones:       string;     // for 'manual' mode — newline/comma separated
  scheduledAt:        string;
  // Header media (for template with IMAGE/VIDEO/DOCUMENT header)
  mediaId:            string;   // URL or WhatsApp media ID — stored in campaigns.media_id
  mediaType:          string;   // image | video | document
  mediaFileName:      string;   // display name for recent history
}

interface ContactPickerItem {
  id: string;
  name: string | null;
  phone: string;
  tags: string[];
}

interface MediaLibraryItem {
  id:          string;
  filename:    string;
  media_id:    string;   // stores URL for URL-based entries
  media_type:  string;
  created_at:  string;
}

interface CampaignWizardProps {
  open:    boolean;
  onClose: () => void;
}

const MEDIA_TYPE_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  IMAGE:    { label: 'Image',    icon: <ImageIcon className="h-3 w-3" />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  VIDEO:    { label: 'Video',    icon: <Video className="h-3 w-3" />,     color: 'bg-purple-100 text-purple-700 border-purple-200' },
  DOCUMENT: { label: 'Document', icon: <FileText className="h-3 w-3" />,  color: 'bg-orange-100 text-orange-700 border-orange-200' },
  TEXT:     { label: 'Text',     icon: null,                               color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function getMediaHeaderType(tpl: { header_type?: string | null } | undefined): string | null {
  const t = tpl?.header_type?.toUpperCase();
  return t && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t) ? t : null;
}

function isValidUrl(val: string): boolean {
  return val.startsWith('http://') || val.startsWith('https://');
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function mediaTypeIcon(type: string) {
  if (type === 'image')    return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (type === 'video')    return <Video className="h-4 w-4 text-purple-500" />;
  if (type === 'document') return <FileText className="h-4 w-4 text-orange-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

// ── Inline Media URL Input (shown in step 2 when template has media header) ──

interface MediaUrlInputProps {
  headerType: string;
  workspaceId: string;
  value: string;
  onChange: (url: string, type: string, name: string) => void;
}

function MediaUrlInput({ headerType, workspaceId, value, onChange }: MediaUrlInputProps) {
  const [inputVal, setInputVal] = useState(value);
  const [recent, setRecent]     = useState<MediaLibraryItem[]>([]);
  const [loadingR, setLoadingR] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const mediaType = headerType.toLowerCase() as 'image' | 'video' | 'document';

  useEffect(() => {
    if (!workspaceId) return;
    setLoadingR(true);
    fetch(`/api/campaigns/upload-media?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { items?: MediaLibraryItem[] }) => {
        // Only show items matching this media type
        setRecent((d.items ?? []).filter((i) => i.media_type === mediaType));
      })
      .catch(() => {})
      .finally(() => setLoadingR(false));
  }, [workspaceId, mediaType]);

  const handleApplyUrl = async () => {
    const url = inputVal.trim();
    if (!isValidUrl(url)) {
      toast.error('Please enter a valid URL starting with https://');
      return;
    }
    // Save to media library
    setSavingUrl(true);
    try {
      await fetch('/api/media-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, url, mediaType, filename: url.split('/').pop()?.split('?')[0] ?? 'media' }),
      });
    } catch { /* non-critical */ }
    setSavingUrl(false);
    const name = url.split('/').pop()?.split('?')[0] ?? url;
    onChange(url, mediaType, name);
    // Refresh recent
    fetch(`/api/campaigns/upload-media?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { items?: MediaLibraryItem[] }) => setRecent((d.items ?? []).filter((i) => i.media_type === mediaType)))
      .catch(() => {});
  };

  const handleSelect = (item: MediaLibraryItem) => {
    setInputVal(item.media_id);
    onChange(item.media_id, item.media_type, item.filename);
    toast.success(`Selected: ${item.filename}`);
  };

  const isApplied = isValidUrl(value) || value.length > 10;

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
      {/* Required notice */}
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          This template has a <strong>{headerType.toLowerCase()} header</strong> — paste a public URL below to set it.
        </p>
      </div>

      {/* URL input */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Link className="h-3.5 w-3.5 text-muted-foreground" />
          {headerType} URL <span className="text-red-500">*</span>
        </Label>
        <div className="flex gap-2">
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={`https://example.com/banner.${mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'pdf'}`}
            className={cn('flex-1 text-sm', isApplied && 'border-green-400 bg-green-50/50')}
            onKeyDown={(e) => e.key === 'Enter' && void handleApplyUrl()}
          />
          <Button
            size="sm"
            onClick={() => void handleApplyUrl()}
            disabled={!inputVal.trim() || savingUrl}
            className="gap-1.5 shrink-0"
          >
            {savingUrl ? <Spin className="h-3.5 w-3.5 animate-spin" /> : isApplied ? <Check className="h-3.5 w-3.5" /> : null}
            {isApplied ? 'Applied ✓' : 'Apply'}
          </Button>
        </div>
        {isApplied && (
          <p className="text-[11px] text-green-700 flex items-center gap-1">
            <Check className="h-3 w-3" /> URL set — preview updated
          </p>
        )}
      </div>

      {/* Recent media */}
      {(loadingR || recent.length > 0) && (
        <div>
          <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 mb-1.5">
            <Clock className="h-3 w-3" /> Recent {headerType.toLowerCase()} URLs
            {loadingR && <Spin className="h-3 w-3 animate-spin ml-1" />}
          </p>
          <div className="space-y-1.5">
            {recent.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className={cn(
                  'w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  value === item.media_id
                    ? 'border-green-400 bg-green-50'
                    : 'border-border bg-white hover:border-brand-300 hover:bg-muted/30',
                )}
              >
                <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0">
                  {mediaTypeIcon(item.media_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.filename}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.media_id}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(item.created_at)}</span>
                  {value === item.media_id
                    ? <Check className="h-3.5 w-3.5 text-green-500" />
                    : <RotateCcw className="h-3 w-3 text-brand-500" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image preview if URL set */}
      {isApplied && mediaType === 'image' && (
        <div className="rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Header preview"
            className="w-full h-28 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseManualPhones(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((p) => normalizePhone(p.trim()))
    .filter(Boolean);
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export function CampaignWizard({ open, onClose }: CampaignWizardProps) {
  const [step, setStep]  = useState(0);
  const [state, setState] = useState<WizardState>({
    name: '', templateId: '', templateIdB: '', abTest: false,
    audienceType: 'all', audienceTag: '', audienceTags: '',
    selectedContactIds: [], manualPhones: '',
    scheduledAt: '',
    mediaId: '', mediaType: '', mediaFileName: '',
  });
  const [contactSearch,   setContactSearch]   = useState('');
  const [contactList,     setContactList]     = useState<ContactPickerItem[]>([]);
  const [contactLoading,  setContactLoading]  = useState(false);
  const mediaInputRef   = useRef<HTMLInputElement>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const workspaceId     = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const { data: templates = [] } = useTemplates();
  const create          = useCreateCampaign();

  const [manualMediaType, setManualMediaType] = useState<string | null>(null); // fallback if header_type is null

  // Fetch contacts when user switches to 'contacts' audience mode
  useEffect(() => {
    if (state.audienceType !== 'contacts' || !workspaceId) return;
    setContactLoading(true);
    const q = new URLSearchParams({ workspaceId, page: '1', pageSize: '200' });
    if (contactSearch.trim()) q.set('search', contactSearch.trim());
    fetch(`/api/contacts/list?${q}`)
      .then((r) => r.json())
      .then((d: { data?: ContactPickerItem[] }) => setContactList(d.data ?? []))
      .catch(() => setContactList([]))
      .finally(() => setContactLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.audienceType, workspaceId, contactSearch]);
  const selectedTemplate  = templates.find((t) => t.id === state.templateId);
  const reqMediaType      = getMediaHeaderType(selectedTemplate) ?? (manualMediaType ?? null);
  const templateNeedsMedia = !!reqMediaType;
  const headerTypeIsUnknown = !!state.templateId && !getMediaHeaderType(selectedTemplate); // template selected but header_type unknown
  const progress          = ((step + 1) / STEPS.length) * 100;
  const approvedTemplates = templates.filter((t) => t.status === 'approved');

  const canProceed = () => {
    if (step === 0) return state.name.trim().length > 0;
    if (step === 1 && templateNeedsMedia && !state.mediaId) return false;
    if (step === 2) {
      if (state.audienceType === 'contacts') return state.selectedContactIds.length > 0;
      if (state.audienceType === 'manual')   return parseManualPhones(state.manualPhones).length > 0;
      if (state.audienceType === 'tag')      return state.audienceTag.trim().length > 0;
    }
    if (step === STEPS.length - 1) return !!(state.templateId || state.mediaId);
    return true;
  };

  const runCampaign = async (campaignId: string): Promise<{ sent?: number; failed?: number; queued?: boolean }> => {
    const res = await fetch(`/api/campaigns/${campaignId}/run`, { method: 'POST' });
    return res.json() as Promise<{ sent?: number; failed?: number; queued?: boolean; error?: string }>;
  };

  const handleCreate = async () => {
    setIsLaunching(true);
    try {
      const audienceFilter =
        state.audienceType === 'tag'      ? { tag: state.audienceTag } :
        state.audienceType === 'tags'     ? { tags: state.audienceTags.split(',').map((t) => t.trim()).filter(Boolean) } :
        state.audienceType === 'contacts' ? { contact_ids: state.selectedContactIds } :
        state.audienceType === 'manual'   ? { phones: parseManualPhones(state.manualPhones) } :
        {};
      const isScheduled = !!state.scheduledAt;

      // datetime-local gives "YYYY-MM-DDTHH:mm" with no tz — append IST offset so
      // Postgres stores the correct UTC value instead of treating it as UTC.
      const scheduledAtIST = state.scheduledAt ? state.scheduledAt + ':00+05:30' : undefined;

      if (state.abTest) {
        const campA = await create.mutateAsync({
          name:            `${state.name} — Version A`,
          template_id:     state.templateId,
          audience_type:   state.audienceType,
          audience_filter: audienceFilter,
          scheduled_at:    scheduledAtIST,
          media_id:        state.mediaId || undefined,
          media_type:      state.mediaType || undefined,
          ab_test_group:   'A',
        } as Parameters<typeof create.mutateAsync>[0]);

        const campB = await create.mutateAsync({
          name:               `${state.name} — Version B`,
          template_id:        state.templateIdB || state.templateId,
          audience_type:      state.audienceType,
          audience_filter:    audienceFilter,
          scheduled_at:       scheduledAtIST,
          media_id:           state.mediaId || undefined,
          media_type:         state.mediaType || undefined,
          ab_test_group:      'B',
          parent_campaign_id: (campA as any).id,
        } as Parameters<typeof create.mutateAsync>[0]);

        if (!isScheduled) {
          await Promise.all([runCampaign((campA as any).id), runCampaign((campB as any).id)]);
          toast.success('A/B campaign launched!');
        } else {
          toast.success(`A/B campaign scheduled for ${new Date(state.scheduledAt).toLocaleString()}`);
        }
      } else {
        const camp = await create.mutateAsync({
          name:            state.name,
          template_id:     state.templateId,
          audience_type:   state.audienceType,
          audience_filter: audienceFilter,
          scheduled_at:    scheduledAtIST,
          media_id:        state.mediaId   || undefined,
          media_type:      state.mediaType || undefined,
        } as Parameters<typeof create.mutateAsync>[0]);

        if (!isScheduled) {
          const result = await runCampaign((camp as any).id);
          if ((result as any).queued) {
            toast.success('Campaign queued — will send shortly');
          } else {
            toast.success(`Campaign sent! ${result.sent ?? 0} messages sent`);
          }
        } else {
          toast.success(`Campaign scheduled for ${new Date(state.scheduledAt).toLocaleString()}`);
        }
      }

      resetAndClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setIsLaunching(false);
    }
  };

  const resetAndClose = () => {
    setStep(0);
    setState({ name: '', templateId: '', templateIdB: '', abTest: false, audienceType: 'all', audienceTag: '', audienceTags: '', selectedContactIds: [], manualPhones: '', scheduledAt: '', mediaId: '', mediaType: '', mediaFileName: '' });
    setContactSearch('');
    setContactList([]);
    onClose();
  };

  // Buttons from selected template (parsed from JSON)
  const templateButtons = (() => {
    try {
      const btns = (selectedTemplate as any)?.buttons;
      if (Array.isArray(btns)) return btns as Array<{ type: string; text: string }>;
      if (typeof btns === 'string') return JSON.parse(btns) as Array<{ type: string; text: string }>;
    } catch { /* */ }
    return [];
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      {/* Wider dialog to fit preview in step 2 */}
      <DialogContent className={cn('transition-all duration-200', step === 1 ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
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
                <span className={cn('text-[10px] hidden sm:block', i === step ? 'text-foreground font-medium' : 'text-muted-foreground')}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[120px] max-h-[65vh] overflow-y-auto py-2 pr-1">

          {/* ── Step 0: Name ─────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Campaign Name</Label>
                <Input id="camp-name" value={state.name} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} placeholder="Black Friday Promo 2026" autoFocus />
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
            </div>
          )}

          {/* ── Step 1: Template + Media URL + Preview ───────────────── */}
          {step === 1 && (
            <div className="flex gap-4">
              {/* Left: template list + media url */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Template <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                  {state.templateId && (
                    <button onClick={() => setState((s) => ({ ...s, templateId: '', mediaId: '', mediaType: '', mediaFileName: '' }))} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                      <X className="h-3 w-3" /> Clear
                    </button>
                  )}
                </div>

                {/* No template option */}
                <button
                  onClick={() => setState((s) => ({ ...s, templateId: '', mediaId: '', mediaType: '', mediaFileName: '' }))}
                  className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', !state.templateId ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-300')}
                >
                  <p className="text-sm font-medium text-muted-foreground">🚫 No template — media only</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Only reaches contacts with active 24-hr session</p>
                </button>

                {/* Template cards */}
                {approvedTemplates.map((t) => {
                  const ht   = t.header_type?.toUpperCase() as string | undefined;
                  const meta = ht && ht !== 'NONE' ? MEDIA_TYPE_MAP[ht] : null;
                  const needsMedia = ht && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(ht);
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setState((s) => ({ ...s, templateId: t.id, mediaId: '', mediaType: '', mediaFileName: '' })); setManualMediaType(null); }}
                      className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', state.templateId === t.id ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-300')}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-medium font-mono flex-1 truncate">{t.name}</p>
                        {meta && (
                          <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border', meta.color)}>
                            {meta.icon}{meta.label}
                          </span>
                        )}
                        {needsMedia && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="h-2.5 w-2.5" />URL needed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
                    </button>
                  );
                })}

                {/* A/B Version B */}
                {state.abTest && (
                  <div className="mt-3 pt-3 border-t border-dashed border-purple-200 space-y-2">
                    <p className="text-xs font-semibold text-purple-700">Version B Template</p>
                    {approvedTemplates.map((t) => (
                      <button key={t.id} onClick={() => setState((s) => ({ ...s, templateIdB: t.id }))}
                        className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', state.templateIdB === t.id ? 'border-purple-500 bg-purple-500/5' : 'border-border hover:border-purple-300')}>
                        <p className="text-sm font-medium font-mono">{t.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{t.body}</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Fallback: template selected but header_type unknown — show manual toggle */}
                {headerTypeIsUnknown && !manualMediaType && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <p className="text-xs text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <strong>Does this template have a media header?</strong>
                    </p>
                    <p className="text-[11px] text-amber-700">
                      If your template has an image, video, or document header on Meta, select the type below.
                    </p>
                    <div className="flex gap-2">
                      {(['IMAGE', 'VIDEO', 'DOCUMENT'] as const).map((type) => {
                        const meta = MEDIA_TYPE_MAP[type];
                        return (
                          <button key={type} onClick={() => setManualMediaType(type)}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:border-amber-500 hover:bg-amber-50 transition-colors">
                            {meta?.icon}{meta?.label}
                          </button>
                        );
                      })}
                      <button onClick={() => setManualMediaType('NONE')}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-gray-400 transition-colors">
                        No media
                      </button>
                    </div>
                  </div>
                )}

                {/* Media URL input (inline, only when needed) */}
                {templateNeedsMedia && reqMediaType && reqMediaType !== 'NONE' && (
                  <MediaUrlInput
                    headerType={reqMediaType}
                    workspaceId={workspaceId}
                    value={state.mediaId}
                    onChange={(url, type, name) => setState((s) => ({ ...s, mediaId: url, mediaType: type, mediaFileName: name }))}
                  />
                )}
              </div>

              {/* Right: WhatsApp Preview */}
              {selectedTemplate && (
                <div className="w-72 shrink-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Preview</p>
                  <WhatsAppPreview
                    headerType={selectedTemplate.header_type ?? 'NONE'}
                    headerText={selectedTemplate.header_type === 'TEXT' ? selectedTemplate.header_content ?? '' : undefined}
                    mediaFileName={
                      state.mediaId
                        ? state.mediaFileName || state.mediaId.split('/').pop()
                        : undefined
                    }
                    body={selectedTemplate.body}
                    footer={selectedTemplate.footer ?? undefined}
                    buttons={templateButtons}
                  />
                  {templateNeedsMedia && !state.mediaId && (
                    <p className="text-center text-[11px] text-amber-600 mt-2 flex items-center justify-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Paste URL to see header image
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Audience ─────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <Label>Audience Segment</Label>
              <Select value={state.audienceType} onValueChange={(v) => {
                setState((s) => ({ ...s, audienceType: v as WizardState['audienceType'] }));
                setContactSearch('');
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌍 All Contacts</SelectItem>
                  <SelectItem value="tag">🏷️ Single Tag</SelectItem>
                  <SelectItem value="tags">🏷️🏷️ Multiple Tags (OR)</SelectItem>
                  <SelectItem value="contacts">✅ Select Specific Contacts</SelectItem>
                  <SelectItem value="manual">📱 Enter Phone Numbers Manually</SelectItem>
                </SelectContent>
              </Select>

              {/* Single tag */}
              {state.audienceType === 'tag' && (
                <div className="space-y-1.5">
                  <Label htmlFor="tag">Tag Name</Label>
                  <Input id="tag" value={state.audienceTag} onChange={(e) => setState((s) => ({ ...s, audienceTag: e.target.value }))} placeholder="e.g. vip" />
                </div>
              )}

              {/* Multiple tags */}
              {state.audienceType === 'tags' && (
                <div className="space-y-1.5">
                  <Label>Tags (comma separated)</Label>
                  <Input value={state.audienceTags} onChange={(e) => setState((s) => ({ ...s, audienceTags: e.target.value }))} placeholder="e.g. vip, premium, leads" />
                  {state.audienceTags && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {state.audienceTags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                        <span key={tag} className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Contact picker */}
              {state.audienceType === 'contacts' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Select Contacts</Label>
                    {state.selectedContactIds.length > 0 && (
                      <span className="text-xs font-semibold text-brand-600">{state.selectedContactIds.length} selected</span>
                    )}
                  </div>
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or number…"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  {/* Select all / clear */}
                  {contactList.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setState((s) => ({ ...s, selectedContactIds: contactList.map((c) => c.id) }))}
                        className="text-[11px] text-brand-600 hover:underline"
                      >
                        Select all {contactList.length}
                      </button>
                      <span className="text-muted-foreground text-[11px]">·</span>
                      <button
                        onClick={() => setState((s) => ({ ...s, selectedContactIds: [] }))}
                        className="text-[11px] text-muted-foreground hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  {/* Contact list */}
                  <div className="rounded-lg border border-border max-h-56 overflow-y-auto divide-y divide-border">
                    {contactLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                        <Spin className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading contacts…</span>
                      </div>
                    ) : contactList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Users className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">No contacts found</p>
                      </div>
                    ) : contactList.map((c) => {
                      const checked = state.selectedContactIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => setState((s) => ({
                            ...s,
                            selectedContactIds: checked
                              ? s.selectedContactIds.filter((id) => id !== c.id)
                              : [...s.selectedContactIds, c.id],
                          }))}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                            checked ? 'bg-brand-50' : 'hover:bg-muted/40',
                          )}
                        >
                          <Checkbox checked={checked} className="pointer-events-none shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{c.name ?? 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                          </div>
                          {c.tags?.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {c.tags.slice(0, 2).map((t) => (
                                <span key={t} className="text-[9px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{t}</span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {state.selectedContactIds.length > 0 && (
                    <p className="text-xs text-brand-600 font-medium">
                      ✓ {state.selectedContactIds.length} contact{state.selectedContactIds.length > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {/* Manual phone numbers */}
              {state.audienceType === 'manual' && (
                <div className="space-y-2">
                  <Label>Phone Numbers</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter one number per line, or comma-separated. Include country code (e.g. 919876543210).
                  </p>
                  <Textarea
                    value={state.manualPhones}
                    onChange={(e) => setState((s) => ({ ...s, manualPhones: e.target.value }))}
                    placeholder={"919876543210\n918765432109\n917654321098"}
                    className="font-mono text-sm min-h-[120px] resize-none"
                    rows={6}
                  />
                  {state.manualPhones.trim() && (() => {
                    const phones = parseManualPhones(state.manualPhones);
                    return phones.length > 0 ? (
                      <div className="flex items-center gap-1.5 text-xs text-brand-600 font-medium">
                        <Phone className="h-3.5 w-3.5" />
                        {phones.length} valid number{phones.length > 1 ? 's' : ''} parsed
                      </div>
                    ) : (
                      <p className="text-xs text-red-500">No valid numbers found — check format</p>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Schedule ─────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-3">
              <Label>Schedule (optional) — IST (India Standard Time)</Label>
              <p className="text-xs text-muted-foreground">Leave empty to send immediately. Select date & time in IST.</p>
              <Input
                type="datetime-local"
                value={state.scheduledAt}
                onChange={(e) => setState((s) => ({ ...s, scheduledAt: e.target.value }))}
              />
              {state.scheduledAt && (
                <p className="text-xs text-brand-600 font-medium">
                  ✓ Scheduled: {new Date(state.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST
                </p>
              )}
            </div>
          )}

          {/* ── Step 4: Review ───────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              {templateNeedsMedia && !state.mediaId && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700">Template requires a {reqMediaType?.toLowerCase()} URL — go back to step 2.</p>
                </div>
              )}
              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <Row label="Name"         value={state.name} />
                <Row label="Template"     value={selectedTemplate?.name ?? '—'} mono />
                {selectedTemplate?.header_type && selectedTemplate.header_type !== 'NONE' && (
                  <Row label="Header type"  value={selectedTemplate.header_type} />
                )}
                {state.mediaId && (
                  <Row label="Header media" value={state.mediaFileName || state.mediaId} />
                )}
                <Row label="Audience" value={
                  state.audienceType === 'all'      ? 'All Contacts' :
                  state.audienceType === 'tag'      ? `Tag: ${state.audienceTag}` :
                  state.audienceType === 'tags'     ? `Tags: ${state.audienceTags}` :
                  state.audienceType === 'contacts' ? `${state.selectedContactIds.length} specific contact${state.selectedContactIds.length !== 1 ? 's' : ''}` :
                  state.audienceType === 'manual'   ? `${parseManualPhones(state.manualPhones).length} phone number${parseManualPhones(state.manualPhones).length !== 1 ? 's' : ''}` :
                  '—'
                } />
                <Row label="Schedule" value={state.scheduledAt ? new Date(state.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : 'Send immediately'} />
              </div>
              {/* Preview */}
              {selectedTemplate && (
                <div className="flex justify-center">
                  <div className="w-64">
                    <p className="text-xs text-muted-foreground text-center mb-2">Message Preview</p>
                    <WhatsAppPreview
                      headerType={selectedTemplate.header_type ?? 'NONE'}
                      headerText={selectedTemplate.header_type === 'TEXT' ? selectedTemplate.header_content ?? '' : undefined}
                      mediaFileName={state.mediaFileName || state.mediaId.split('/').pop()}
                      body={selectedTemplate.body}
                      footer={selectedTemplate.footer ?? undefined}
                      buttons={templateButtons}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => step === 0 ? resetAndClose() : setStep((s) => s - 1)}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canProceed()} onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled={create.isPending || isLaunching || (templateNeedsMedia && !state.mediaId)}
              onClick={() => void handleCreate()}
            >
              {(create.isPending || isLaunching) ? (state.scheduledAt ? 'Scheduling…' : 'Launching…') : (state.scheduledAt ? 'Schedule Campaign' : 'Send Now')}
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
      <span className={cn('font-medium text-right truncate max-w-[60%]', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}
