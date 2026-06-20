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
  Search, Users, Phone, Upload, Timer, MapPin, Music, LayoutGrid,
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
  selectedContactIds: string[];
  manualPhones:       string;
  scheduledAt:        string;
  // Header media (IMAGE/VIDEO/DOCUMENT templates)
  mediaId:            string;
  mediaType:          string;
  mediaFileName:      string;
  mediaPreviewUrl:    string;   // local blob URL or http URL for in-wizard preview only
  mediaCaption:       string;   // optional caption for media-only campaigns
  // LTO (Limited Time Offer) fields
  ltoCouponCode:      string;
  ltoExpiryAt:        string;   // datetime-local value
  // Carousel card media URLs — one per card
  cardMediaUrls:      string[];
  // Location campaign
  campaignType:       'standard' | 'location' | 'audio';
  locationLat:        string;
  locationLng:        string;
  locationName:       string;
  locationAddress:    string;
  // Audio campaign
  audioUrl:           string;
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

// ── Media Picker — file upload (primary) + recent library + URL fallback ──

interface MediaUrlInputProps {
  headerType: string;
  workspaceId: string;
  value: string;
  onChange: (mediaId: string, type: string, name: string, previewUrl?: string) => void;
  allowUrl?: boolean;  // show URL fallback option (default hidden)
}

const ACCEPT_BY_TYPE: Record<string, string> = {
  IMAGE:    'image/jpeg,image/png,image/webp',
  VIDEO:    'video/mp4',
  DOCUMENT: 'application/pdf',
};

function MediaUrlInput({ headerType, workspaceId, value, onChange, allowUrl = false }: MediaUrlInputProps) {
  const fileRef            = useRef<HTMLInputElement>(null);
  const [recent, setRecent]       = useState<MediaLibraryItem[]>([]);
  const [loadingR, setLoadingR]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl]     = useState(false);
  const [urlVal, setUrlVal]       = useState('');
  const [dragOver, setDragOver]   = useState(false);
  const mediaType = headerType.toLowerCase() as 'image' | 'video' | 'document';

  const refreshRecent = () => {
    fetch(`/api/campaigns/upload-media?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { items?: MediaLibraryItem[] }) =>
        setRecent((d.items ?? []).filter((i) => i.media_type === mediaType)))
      .catch(() => {});
  };

  useEffect(() => {
    if (!workspaceId) return;
    setLoadingR(true);
    fetch(`/api/campaigns/upload-media?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { items?: MediaLibraryItem[] }) =>
        setRecent((d.items ?? []).filter((i) => i.media_type === mediaType)))
      .catch(() => {})
      .finally(() => setLoadingR(false));
  }, [workspaceId, mediaType]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('workspaceId', workspaceId);
      const res  = await fetch('/api/campaigns/upload-media', { method: 'POST', body: fd });
      const data = await res.json() as { mediaId?: string; mediaType?: string; fileName?: string; error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Upload failed'); return; }
      onChange(data.mediaId!, data.mediaType!, data.fileName!, previewUrl);
      toast.success(`Uploaded: ${data.fileName}`);
      refreshRecent();
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    void uploadFile(files[0]!);
  };

  const handleSelect = (item: MediaLibraryItem) => {
    // If stored as URL (old flow), use as preview; WhatsApp media IDs can't be shown in browser
    const previewUrl = item.media_id.startsWith('http') ? item.media_id : undefined;
    onChange(item.media_id, item.media_type, item.filename, previewUrl);
    toast.success(`Selected: ${item.filename}`);
  };

  const handleApplyUrl = async () => {
    const url = urlVal.trim();
    if (!isValidUrl(url)) { toast.error('Enter a valid https:// URL'); return; }
    try {
      await fetch('/api/media-library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, url, mediaType, filename: url.split('/').pop()?.split('?')[0] ?? 'media' }),
      });
    } catch { /* non-critical */ }
    const name = url.split('/').pop()?.split('?')[0] ?? url;
    onChange(url, mediaType, name, url);  // URL is its own preview
    refreshRecent();
    setShowUrl(false);
  };

  const isSet = value.length > 6;
  const selectedItem = recent.find((i) => i.media_id === value);

  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3 space-y-3">
      <p className="text-xs font-semibold text-brand-800 flex items-center gap-1.5">
        <Upload className="h-3.5 w-3.5" />
        {headerType} Media <span className="text-red-500">*</span>
      </p>

      {/* Success state */}
      {isSet && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2">
          <Check className="h-4 w-4 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-green-800 truncate">
              {selectedItem?.filename ?? (value.startsWith('http') ? value.split('/').pop() : 'Media set ✓')}
            </p>
          </div>
          <button onClick={() => onChange('', mediaType, '', '')} className="text-[10px] text-green-600 hover:text-red-500 shrink-0">
            Change
          </button>
        </div>
      )}

      {/* Upload drop zone (shown when nothing selected) */}
      {!isSet && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => !uploading && fileRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 cursor-pointer transition-colors',
            dragOver ? 'border-brand-500 bg-brand-100' : 'border-brand-300 hover:border-brand-500 hover:bg-brand-50',
          )}
        >
          {uploading
            ? <><Spin className="h-5 w-5 animate-spin text-brand-500" /><p className="text-xs text-brand-600">Uploading…</p></>
            : <><Upload className="h-5 w-5 text-brand-500" />
               <p className="text-xs font-medium text-brand-700">Click to upload or drag & drop</p>
               <p className="text-[10px] text-muted-foreground">
                 {mediaType === 'image' ? 'JPG, PNG, WebP' : mediaType === 'video' ? 'MP4' : 'PDF'} · Max 16 MB
               </p></>
          }
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_BY_TYPE[headerType] ?? '*'}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Recent uploads */}
      {(loadingR || recent.length > 0) && (
        <div>
          <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 mb-1.5">
            <Clock className="h-3 w-3" /> Recent uploads
            {loadingR && <Spin className="h-3 w-3 animate-spin ml-1" />}
          </p>
          <div className="space-y-1.5">
            {recent.map((item) => (
              <button key={item.id} onClick={() => handleSelect(item)}
                className={cn(
                  'w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  value === item.media_id ? 'border-green-400 bg-green-50' : 'border-border bg-white hover:border-brand-300 hover:bg-muted/30',
                )}
              >
                <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0">{mediaTypeIcon(item.media_type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.filename}</p>
                  <p className="text-[10px] text-muted-foreground">{timeAgo(item.created_at)}</p>
                </div>
                {value === item.media_id ? <Check className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <RotateCcw className="h-3 w-3 text-brand-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* URL fallback — shown only when allowUrl=true (template with media header) */}
      {allowUrl && !showUrl && !isSet && (
        <button onClick={() => setShowUrl(true)} className="text-[11px] text-muted-foreground hover:text-brand-600 underline">
          Or paste a URL instead
        </button>
      )}
      {showUrl && (
        <div className="flex gap-2">
          <Input value={urlVal} onChange={(e) => setUrlVal(e.target.value)}
            placeholder={`https://example.com/file.${mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'pdf'}`}
            className="flex-1 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && void handleApplyUrl()}
          />
          <Button size="sm" onClick={() => void handleApplyUrl()} disabled={!urlVal.trim()}>Apply</Button>
        </div>
      )}

      {/* Image preview */}
      {isSet && value.startsWith('http') && mediaType === 'image' && (
        <div className="rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview" className="w-full h-28 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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

function parseCsvForPhones(text: string): string[] {
  const lines = text.split('\n');
  if (lines.length === 0) return [];
  // BOM-safe header
  const headerLine = (lines[0] ?? '').replace(/^﻿/, '').trim();
  const headers = headerLine.split(',').map((h) => h.replace(/"/g, '').trim());
  // Find phone column (case-insensitive, fuzzy)
  const phoneKeywords = ['phone', 'mobile', 'number', 'whatsapp', 'contact', 'tel', 'cell'];
  let phoneIdx = -1;
  for (const kw of phoneKeywords) {
    const idx = headers.findIndex((h) => h.toLowerCase() === kw);
    if (idx >= 0) { phoneIdx = idx; break; }
  }
  if (phoneIdx < 0) {
    // fallback: any header containing a keyword
    for (const kw of phoneKeywords) {
      const idx = headers.findIndex((h) => h.toLowerCase().includes(kw));
      if (idx >= 0) { phoneIdx = idx; break; }
    }
  }
  if (phoneIdx < 0) {
    // Last resort: treat first column as phone
    phoneIdx = 0;
  }
  const phones: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(',');
    const raw = (cols[phoneIdx] ?? '').replace(/"/g, '').trim();
    if (!raw) continue;
    const normalized = normalizePhone(raw);
    if (normalized.length >= 7) phones.push(normalized);
  }
  return phones;
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export function CampaignWizard({ open, onClose }: CampaignWizardProps) {
  const [step, setStep]  = useState(0);
  const [state, setState] = useState<WizardState>({
    name: '', templateId: '', templateIdB: '', abTest: false,
    audienceType: 'all', audienceTag: '', audienceTags: '',
    selectedContactIds: [], manualPhones: '',
    scheduledAt: '',
    mediaId: '', mediaType: '', mediaFileName: '', mediaPreviewUrl: '', mediaCaption: '',
    ltoCouponCode: '', ltoExpiryAt: '', cardMediaUrls: [],
    campaignType: 'standard',
    locationLat: '', locationLng: '', locationName: '', locationAddress: '',
    audioUrl: '',
  });
  const [contactSearch,   setContactSearch]   = useState('');
  const [contactList,     setContactList]     = useState<ContactPickerItem[]>([]);
  const [contactLoading,  setContactLoading]  = useState(false);
  const mediaInputRef   = useRef<HTMLInputElement>(null);
  const csvImportRef    = useRef<HTMLInputElement>(null);
  const [csvImporting,  setCsvImporting]  = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [testPhone,   setTestPhone]   = useState('');
  const [testSending, setTestSending] = useState(false);
  const workspaceId     = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const { data: templates = [] } = useTemplates();
  const create          = useCreateCampaign();

  const [manualMediaType,  setManualMediaType]  = useState<string | null>(null);
  const [templateSearch,   setTemplateSearch]   = useState('');

  // CSV import handler for Manual audience type
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const phones = parseCsvForPhones(text);
        if (phones.length === 0) {
          toast.error('No phone numbers found in CSV. Make sure column is named "Phone", "Mobile", or similar.');
        } else {
          setState((s) => ({
            ...s,
            audienceType: 'manual',
            manualPhones: [
              ...new Set([
                ...parseManualPhones(s.manualPhones),
                ...phones,
              ]),
            ].join('\n'),
          }));
          toast.success(`${phones.length} numbers imported from CSV`);
        }
      } catch {
        toast.error('Failed to parse CSV');
      } finally {
        setCsvImporting(false);
        if (csvImportRef.current) csvImportRef.current.value = '';
      }
    };
    reader.onerror = () => { toast.error('Failed to read file'); setCsvImporting(false); };
    reader.readAsText(file);
  };

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
  const selectedTemplate    = templates.find((t) => t.id === state.templateId);
  const selectedTemplateAny = selectedTemplate as any;
  const reqMediaType        = getMediaHeaderType(selectedTemplate) ?? (manualMediaType ?? null);
  const templateNeedsMedia  = !!reqMediaType && state.campaignType === 'standard';
  const headerTypeIsUnknown = !!state.templateId && !getMediaHeaderType(selectedTemplate);
  const templateIsLTO       = !!selectedTemplateAny?.has_lto;
  const templateIsCarousel  = !!selectedTemplateAny?.is_carousel;
  const templateCards       = (selectedTemplateAny?.cards ?? []) as Array<{ body: string; header_type: string }>;
  const progress            = ((step + 1) / STEPS.length) * 100;
  const approvedTemplates   = templates.filter((t) => t.status === 'approved');
  const filteredTemplates   = templateSearch.trim()
    ? approvedTemplates.filter((t) => t.name.toLowerCase().includes(templateSearch.toLowerCase()))
    : approvedTemplates;

  const canProceed = () => {
    if (step === 0) return state.name.trim().length > 0;
    if (step === 1) {
      if (state.campaignType === 'location') return !!(state.locationLat && state.locationLng);
      if (state.campaignType === 'audio')    return !!state.audioUrl.trim();
      if (templateNeedsMedia && !state.mediaId) return false;
      if (templateIsLTO && !state.ltoCouponCode.trim()) return false;
      if (templateIsCarousel && templateCards.length > 0) {
        const needed = templateCards.filter((c) => c.header_type !== 'NONE').length;
        if (state.cardMediaUrls.filter(Boolean).length < needed) return false;
      }
    }
    if (step === 2) {
      if (state.audienceType === 'contacts') return state.selectedContactIds.length > 0;
      if (state.audienceType === 'manual')   return parseManualPhones(state.manualPhones).length > 0;
      if (state.audienceType === 'tag')      return state.audienceTag.trim().length > 0;
    }
    if (step === STEPS.length - 1) {
      return !!(state.templateId || state.mediaId || state.campaignType !== 'standard');
    }
    return true;
  };

  const runCampaign = async (campaignId: string): Promise<{ sent?: number; failed?: number; queued?: boolean }> => {
    const res = await fetch(`/api/campaigns/${campaignId}/run`, { method: 'POST' });
    return res.json() as Promise<{ sent?: number; failed?: number; queued?: boolean; error?: string }>;
  };

  const handleTestSend = async () => {
    if (!testPhone.trim() || (!state.templateId && !state.mediaId)) return;
    setTestSending(true);
    try {
      const res = await fetch('/api/campaigns/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          templateId:   state.templateId   || undefined,
          toPhone:      testPhone.trim(),
          mediaId:      state.mediaId      || undefined,
          mediaType:    state.mediaType    || undefined,
          mediaCaption: state.mediaCaption || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        toast.error(`Test failed: ${data.error ?? 'Unknown error'}`);
      } else {
        toast.success(`✅ Test message sent to ${testPhone.trim()}`);
      }
    } catch {
      toast.error('Test send failed — check connection');
    } finally {
      setTestSending(false);
    }
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
        // Build extra fields for new campaign types
        const extraFields: Record<string, unknown> = {};
        if (state.campaignType === 'location') {
          extraFields.location_lat     = parseFloat(state.locationLat) || null;
          extraFields.location_lng     = parseFloat(state.locationLng) || null;
          extraFields.location_name    = state.locationName || null;
          extraFields.location_address = state.locationAddress || null;
          extraFields.media_type       = 'location';
        } else if (state.campaignType === 'audio') {
          extraFields.media_id   = state.audioUrl || undefined;
          extraFields.media_type = 'audio';
        }
        if (selectedTemplateAny?.has_lto && state.ltoCouponCode) {
          const expiryIST = state.ltoExpiryAt ? state.ltoExpiryAt + ':00+05:30' : undefined;
          extraFields.lto_coupon_code = state.ltoCouponCode;
          extraFields.lto_expiry_at   = expiryIST;
        }
        if (selectedTemplateAny?.is_carousel && state.cardMediaUrls.length > 0) {
          extraFields.card_media_urls = state.cardMediaUrls;
        }

        const camp = await create.mutateAsync({
          name:            state.name,
          template_id:     state.templateId || undefined,
          audience_type:   state.audienceType,
          audience_filter: audienceFilter,
          scheduled_at:    scheduledAtIST,
          media_id:        state.mediaId      || undefined,
          media_type:      state.mediaType    || undefined,
          media_caption:   state.mediaCaption || undefined,
          ...extraFields,
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
    setState({
      name: '', templateId: '', templateIdB: '', abTest: false,
      audienceType: 'all', audienceTag: '', audienceTags: '',
      selectedContactIds: [], manualPhones: '', scheduledAt: '',
      mediaId: '', mediaType: '', mediaFileName: '', mediaPreviewUrl: '', mediaCaption: '',
      ltoCouponCode: '', ltoExpiryAt: '', cardMediaUrls: [],
      campaignType: 'standard',
      locationLat: '', locationLng: '', locationName: '', locationAddress: '',
      audioUrl: '',
    });
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
                    <button onClick={() => setState((s) => ({ ...s, templateId: '', mediaId: '', mediaType: '', mediaFileName: '', mediaPreviewUrl: '' }))} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                      <X className="h-3 w-3" /> Clear
                    </button>
                  )}
                </div>

                {/* No template option */}
                <button
                  onClick={() => { setState((s) => ({ ...s, templateId: '', mediaId: '', mediaType: '', mediaFileName: '', mediaPreviewUrl: '', campaignType: 'standard' })); setManualMediaType(null); }}
                  className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', !state.templateId && state.campaignType === 'standard' ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-300')}
                >
                  <p className="text-sm font-medium text-muted-foreground">📎 No template — media only</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Send image / video / document — session contacts only</p>
                </button>

                {/* Standalone media type picker (shown when "No template" is selected) */}
                {!state.templateId && state.campaignType === 'standard' && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 space-y-2">
                    <p className="text-xs font-semibold text-brand-800">What type of media do you want to send?</p>
                    <div className="flex gap-2">
                      {(['IMAGE', 'VIDEO', 'DOCUMENT'] as const).map((type) => {
                        const meta = MEDIA_TYPE_MAP[type];
                        return (
                          <button key={type} onClick={() => setManualMediaType(type)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                              manualMediaType === type
                                ? 'border-brand-500 bg-brand-500 text-white'
                                : 'border-brand-300 bg-white text-brand-800 hover:border-brand-500 hover:bg-brand-50',
                            )}>
                            {meta?.icon}{meta?.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Location option */}
                <button
                  onClick={() => setState((s) => ({ ...s, templateId: '', campaignType: 'location' }))}
                  className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', state.campaignType === 'location' ? 'border-emerald-500 bg-emerald-500/5' : 'border-border hover:border-emerald-300')}
                >
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                    <p className="text-sm font-medium">📍 Location Pin</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Send your store/office location — session contacts only</p>
                </button>

                {/* Audio option */}
                <button
                  onClick={() => setState((s) => ({ ...s, templateId: '', campaignType: 'audio' }))}
                  className={cn('w-full rounded-lg border p-2.5 text-left transition-colors', state.campaignType === 'audio' ? 'border-purple-500 bg-purple-500/5' : 'border-border hover:border-purple-300')}
                >
                  <div className="flex items-center gap-1.5">
                    <Music className="h-3.5 w-3.5 text-purple-600" />
                    <p className="text-sm font-medium">🔊 Audio Message</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Voice note or audio file — session contacts only</p>
                </button>

                {/* Template search */}
                {approvedTemplates.length > 4 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Search templates…"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                )}

                {/* Template cards */}
                {filteredTemplates.map((t) => {
                  const ht   = t.header_type?.toUpperCase() as string | undefined;
                  const meta = ht && ht !== 'NONE' ? MEDIA_TYPE_MAP[ht] : null;
                  const needsMedia = ht && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(ht);
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setState((s) => ({ ...s, templateId: t.id, mediaId: '', mediaType: '', mediaFileName: '', mediaPreviewUrl: '' })); setManualMediaType(null); }}
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
                            <Upload className="h-2.5 w-2.5" />Media needed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
                    </button>
                  );
                })}
                {filteredTemplates.length === 0 && templateSearch && (
                  <p className="text-xs text-muted-foreground text-center py-4">No templates match "{templateSearch}"</p>
                )}

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

                {/* Media picker (standard templates with IMAGE/VIDEO/DOCUMENT header) */}
                {templateNeedsMedia && reqMediaType && reqMediaType !== 'NONE' && state.campaignType === 'standard' && (
                  <>
                    <MediaUrlInput
                      headerType={reqMediaType}
                      workspaceId={workspaceId}
                      value={state.mediaId}
                      allowUrl={!!state.templateId}
                      onChange={(mediaId, type, name, previewUrl) => setState((s) => ({ ...s, mediaId, mediaType: type, mediaFileName: name, mediaPreviewUrl: previewUrl ?? '' }))}
                    />
                    {/* Caption / text — only for media-only (no template), not for template headers */}
                    {!state.templateId && state.mediaId && reqMediaType !== 'DOCUMENT' && (
                      <div className="mt-2 space-y-1">
                        <Label className="text-xs text-muted-foreground">Caption / Message Text (optional)</Label>
                        <Textarea
                          value={state.mediaCaption}
                          onChange={(e) => setState((s) => ({ ...s, mediaCaption: e.target.value }))}
                          placeholder="Add a message to send with the media…"
                          rows={3}
                          className="text-sm resize-none"
                          maxLength={1024}
                        />
                        <p className="text-[10px] text-muted-foreground text-right">{state.mediaCaption.length}/1024</p>
                      </div>
                    )}
                  </>
                )}

                {/* LTO fields (shown when selected template has_lto) */}
                {templateIsLTO && state.campaignType === 'standard' && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Timer className="h-4 w-4 text-amber-600" />
                      <p className="text-xs font-semibold text-amber-800">Limited Time Offer Settings</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Coupon Code <span className="text-red-500">*</span></Label>
                      <Input
                        value={state.ltoCouponCode}
                        onChange={(e) => setState((s) => ({ ...s, ltoCouponCode: e.target.value.toUpperCase() }))}
                        placeholder="SAVE20"
                        maxLength={15}
                        className="font-mono uppercase"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Offer Expiry (IST) <span className="text-muted-foreground">(optional)</span></Label>
                      <Input
                        type="datetime-local"
                        value={state.ltoExpiryAt}
                        onChange={(e) => setState((s) => ({ ...s, ltoExpiryAt: e.target.value }))}
                      />
                      <p className="text-[11px] text-amber-700">WhatsApp will show a countdown timer until this time</p>
                    </div>
                  </div>
                )}

                {/* Carousel card media URLs */}
                {templateIsCarousel && state.campaignType === 'standard' && templateCards.length > 0 && (
                  <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <LayoutGrid className="h-4 w-4 text-purple-600" />
                      <p className="text-xs font-semibold text-purple-800">Carousel Card Images</p>
                    </div>
                    {templateCards.map((card, ci) => (
                      card.header_type !== 'NONE' && (
                        <div key={ci} className="space-y-1.5">
                          <Label className="text-xs">Card {ci + 1} — {card.header_type} URL <span className="text-red-500">*</span></Label>
                          <Input
                            value={state.cardMediaUrls[ci] ?? ''}
                            onChange={(e) => {
                              const urls = [...state.cardMediaUrls];
                              urls[ci] = e.target.value;
                              setState((s) => ({ ...s, cardMediaUrls: urls }));
                            }}
                            placeholder={`https://example.com/card${ci + 1}.${card.header_type === 'VIDEO' ? 'mp4' : 'jpg'}`}
                            className="text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground truncate">{card.body.slice(0, 60)}</p>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {/* Location fields */}
                {state.campaignType === 'location' && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-800">Location Details</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Latitude <span className="text-red-500">*</span></Label>
                        <Input value={state.locationLat} onChange={(e) => setState((s) => ({ ...s, locationLat: e.target.value }))} placeholder="28.6139" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Longitude <span className="text-red-500">*</span></Label>
                        <Input value={state.locationLng} onChange={(e) => setState((s) => ({ ...s, locationLng: e.target.value }))} placeholder="77.2090" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Place Name</Label>
                      <Input value={state.locationName} onChange={(e) => setState((s) => ({ ...s, locationName: e.target.value }))} placeholder="Our Office" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Address</Label>
                      <Input value={state.locationAddress} onChange={(e) => setState((s) => ({ ...s, locationAddress: e.target.value }))} placeholder="123 Main St, New Delhi" />
                    </div>
                    <p className="text-[11px] text-emerald-700">Only contacts with active 24h WhatsApp session will receive this.</p>
                  </div>
                )}

                {/* Audio URL */}
                {state.campaignType === 'audio' && (
                  <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Music className="h-4 w-4 text-purple-600" />
                      <p className="text-xs font-semibold text-purple-800">Audio File URL</p>
                    </div>
                    <Input
                      value={state.audioUrl}
                      onChange={(e) => setState((s) => ({ ...s, audioUrl: e.target.value }))}
                      placeholder="https://example.com/audio.mp3 or .ogg"
                    />
                    <p className="text-[11px] text-purple-700">Supported: mp3, ogg, aac. Only session contacts will receive this.</p>
                  </div>
                )}
              </div>

              {/* Right: WhatsApp Preview */}
              {selectedTemplate && (
                <div className="w-72 shrink-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Preview</p>
                  <WhatsAppPreview
                    headerType={selectedTemplate.header_type ?? 'NONE'}
                    headerText={selectedTemplate.header_type === 'TEXT' ? selectedTemplate.header_content ?? '' : undefined}
                    mediaFileName={state.mediaFileName || undefined}
                    mediaPreviewUrl={state.mediaPreviewUrl || undefined}
                    body={selectedTemplate.body}
                    footer={selectedTemplate.footer ?? undefined}
                    buttons={templateButtons}
                  />
                  {templateNeedsMedia && !state.mediaId && (
                    <p className="text-center text-[11px] text-amber-600 mt-2 flex items-center justify-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Upload media to see header preview
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
                  <div className="flex items-center justify-between">
                    <Label>Phone Numbers</Label>
                    <Button
                      type="button" size="sm" variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => csvImportRef.current?.click()}
                      disabled={csvImporting}
                    >
                      {csvImporting
                        ? <><Spin className="h-3 w-3 animate-spin" /> Importing…</>
                        : <><Upload className="h-3 w-3" /> Upload CSV</>
                      }
                    </Button>
                  </div>
                  <input
                    ref={csvImportRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvImport}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter one number per line, or comma-separated. Include country code (e.g. 919876543210). Or upload a CSV file with a Phone/Mobile column.
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
                {state.campaignType === 'location' ? (
                  <>
                    <Row label="Type"     value="📍 Location" />
                    <Row label="Location" value={state.locationName || `${state.locationLat}, ${state.locationLng}`} />
                  </>
                ) : state.campaignType === 'audio' ? (
                  <Row label="Type"       value="🔊 Audio Message" />
                ) : (
                  <>
                    <Row label="Template"     value={selectedTemplate?.name ?? '—'} mono />
                    {templateIsLTO && state.ltoCouponCode && (
                      <Row label="Coupon Code" value={state.ltoCouponCode} />
                    )}
                    {templateIsCarousel && (
                      <Row label="Cards" value={`${templateCards.length} cards`} />
                    )}
                    {selectedTemplate?.header_type && selectedTemplate.header_type !== 'NONE' && (
                      <Row label="Header type" value={selectedTemplate.header_type} />
                    )}
                    {state.mediaId && (
                      <Row label="Header media" value={state.mediaFileName || state.mediaId} />
                    )}
                  </>
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
              {/* Test Send */}
              <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-brand-700 flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5" /> Send Test Message
                </p>
                <p className="text-[11px] text-muted-foreground">Send a preview to your own number before launching the campaign.</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="+91 98765 43210"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="h-8 text-sm flex-1"
                  />
                  <Button
                    size="sm" variant="outline" className="h-8 text-xs shrink-0 border-brand-300 text-brand-700 hover:bg-brand-100"
                    disabled={!testPhone.trim() || (!state.templateId && !state.mediaId) || testSending}
                    onClick={() => void handleTestSend()}
                  >
                    {testSending ? <Spin className="h-3.5 w-3.5 animate-spin" /> : 'Send Test'}
                  </Button>
                </div>
              </div>

              {/* Preview */}
              {selectedTemplate && state.campaignType === 'standard' && !templateIsCarousel && (
                <div className="flex justify-center">
                  <div className="w-64">
                    <p className="text-xs text-muted-foreground text-center mb-2">Message Preview</p>
                    <WhatsAppPreview
                      headerType={selectedTemplate.header_type ?? 'NONE'}
                      headerText={selectedTemplate.header_type === 'TEXT' ? selectedTemplate.header_content ?? '' : undefined}
                      mediaFileName={state.mediaFileName || undefined}
                      mediaPreviewUrl={state.mediaPreviewUrl || undefined}
                      body={selectedTemplate.body}
                      footer={selectedTemplate.footer ?? undefined}
                      buttons={templateButtons}
                      hasLTO={templateIsLTO}
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
