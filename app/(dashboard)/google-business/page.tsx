'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Store, Star, Sparkles, RefreshCw, Send, MessageCircleQuestion, Megaphone, BarChart3 } from 'lucide-react';
import { useRequirePageRole } from '@/hooks/useRequirePageRole';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Request failed'); return d; });

function Stars({ n }: { n: number | null }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < (n ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
      ))}
    </span>
  );
}

export default function GoogleBusinessPage() {
  useRequirePageRole('google-business');
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['gbp-status', workspaceId],
    queryFn: () => fetch(`/api/integrations/gbp/status?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId,
  });

  const { data: locData } = useQuery({
    queryKey: ['gbp-locations', workspaceId],
    queryFn: () => fetch(`/api/gbp/locations?workspaceId=${workspaceId}`).then((r) => r.json()),
    enabled: !!workspaceId && !!status?.connected,
  });
  const locations: Array<{ location_id: string; title: string | null }> = locData?.locations ?? [];
  const [locationId, setLocationId] = useState('all');

  async function handleSync() {
    setSyncing(true);
    try {
      await post('/api/integrations/gbp/sync', { workspaceId });
      toast.success('Synced from Google');
      void qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally { setSyncing(false); }
  }

  if (statusLoading) return <div className="p-6"><Skeleton className="h-40 w-full" /></div>;

  if (!status?.connected) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <Store className="h-7 w-7 text-brand-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Connect Google Business Profile</h1>
        <p className="text-sm text-gray-500">
          Manage your reviews, posts, Q&amp;A and performance insights from AI Agentix — with AI-drafted replies you approve.
        </p>
        <a href={`/api/integrations/gbp/connect?workspaceId=${workspaceId}`}>
          <Button className="bg-brand-500 hover:bg-brand-600 text-white">Connect Google Business</Button>
        </a>
        <p className="text-xs text-gray-400">You&apos;ll authorize with your Google account. You can disconnect anytime from Settings → Integrations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Store className="h-6 w-6 text-brand-500" /> Google Business
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {status.email} · {status.locations} location{status.locations !== 1 ? 's' : ''}
            {status.last_synced_at && <> · synced {new Date(status.last_synced_at).toLocaleString('en-IN')}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locations.length > 0 && (
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.title ?? l.location_id}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => void handleSync()} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="reviews">
        <TabsList>
          <TabsTrigger value="reviews"><Star className="h-3.5 w-3.5 mr-1.5" /> Reviews</TabsTrigger>
          <TabsTrigger value="qa"><MessageCircleQuestion className="h-3.5 w-3.5 mr-1.5" /> Q&amp;A</TabsTrigger>
          <TabsTrigger value="posts"><Megaphone className="h-3.5 w-3.5 mr-1.5" /> Posts</TabsTrigger>
          <TabsTrigger value="insights"><BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews"><ReviewsTab workspaceId={workspaceId!} locationId={locationId} /></TabsContent>
        <TabsContent value="qa"><QATab workspaceId={workspaceId!} locationId={locationId} /></TabsContent>
        <TabsContent value="posts"><PostsTab workspaceId={workspaceId!} locationId={locationId} locations={locations} /></TabsContent>
        <TabsContent value="insights"><InsightsTab workspaceId={workspaceId!} locationId={locationId} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Reviews ─────────────────────────────────────────────────────────────────
function ReviewsTab({ workspaceId, locationId }: { workspaceId: string; locationId: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState('all');
  const [status, setStatus] = useState('all');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const params = new URLSearchParams({ workspaceId, locationId, rating, status });
  const { data, isLoading } = useQuery({
    queryKey: ['gbp-reviews', workspaceId, locationId, rating, status],
    queryFn: () => fetch(`/api/gbp/reviews?${params}`).then((r) => r.json()),
  });
  const reviews = data?.reviews ?? [];

  async function draft(id: string) {
    setBusy(id);
    try { const d = await post(`/api/gbp/reviews/${id}/draft`, { workspaceId }); setDrafts((p) => ({ ...p, [id]: d.draft })); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Draft failed'); }
    finally { setBusy(null); }
  }
  async function reply(id: string, comment: string) {
    if (!comment.trim()) { toast.error('Reply is empty'); return; }
    setBusy(id);
    try { await post(`/api/gbp/reviews/${id}/reply`, { workspaceId, comment }); toast.success('Reply posted to Google'); void qc.invalidateQueries({ queryKey: ['gbp-reviews'] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Reply failed'); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={rating} onValueChange={setRating}>
          <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            {[5, 4, 3, 2, 1].map((s) => <SelectItem key={s} value={String(s)}>{s} star</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="none">Unanswered</SelectItem>
            <SelectItem value="posted">Replied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : reviews.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No reviews yet. Hit Sync to pull the latest from Google.</p>
      ) : reviews.map((r: any) => (
        <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{r.reviewer_name ?? 'Customer'}</span>
              <Stars n={r.star_rating} />
            </div>
            {r.reply_status === 'posted'
              ? <Badge variant="outline" className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50">Replied</Badge>
              : <Badge variant="outline" className="text-xs border-amber-200 text-amber-700 bg-amber-50">Needs reply</Badge>}
          </div>
          {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}

          {r.reply_status === 'posted' ? (
            <div className="rounded-lg bg-gray-50 p-2.5 text-sm text-gray-600"><span className="font-medium text-gray-500">Your reply: </span>{r.reply_comment}</div>
          ) : (
            <div className="space-y-2 pt-1">
              <Textarea
                value={drafts[r.id] ?? r.ai_draft ?? ''}
                onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                placeholder="Write a reply, or generate an AI draft…"
                className="text-sm min-h-[70px]"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => void draft(r.id)}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI draft
                </Button>
                <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" disabled={busy === r.id}
                  onClick={() => void reply(r.id, drafts[r.id] ?? r.ai_draft ?? '')}>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Approve &amp; Reply
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Q&A ─────────────────────────────────────────────────────────────────────
function QATab({ workspaceId, locationId }: { workspaceId: string; locationId: string }) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['gbp-questions', workspaceId, locationId],
    queryFn: () => fetch(`/api/gbp/questions?workspaceId=${workspaceId}&locationId=${locationId}`).then((r) => r.json()),
  });
  const questions = data?.questions ?? [];

  async function answer(id: string, text: string) {
    if (!text.trim()) { toast.error('Answer is empty'); return; }
    setBusy(id);
    try { await post(`/api/gbp/questions/${id}/answer`, { workspaceId, text }); toast.success('Answer posted'); void qc.invalidateQueries({ queryKey: ['gbp-questions'] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Answer failed'); }
    finally { setBusy(null); }
  }
  async function draft(id: string) {
    setBusy(id);
    try { const d = await post(`/api/gbp/questions/${id}/draft`, { workspaceId }); setAnswers((p) => ({ ...p, [id]: d.draft })); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Draft failed'); }
    finally { setBusy(null); }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (questions.length === 0) return <p className="text-sm text-gray-400 text-center py-12">No questions yet.</p>;

  return (
    <div className="space-y-4">
      {questions.map((q: any) => (
        <div key={q.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          <p className="text-sm font-medium text-gray-900">{q.text}</p>
          <p className="text-xs text-gray-400">asked by {q.author_name ?? 'a customer'}</p>
          {q.answer_status === 'posted' ? (
            <div className="rounded-lg bg-gray-50 p-2.5 text-sm text-gray-600"><span className="font-medium text-gray-500">Answer: </span>{q.answer_text}</div>
          ) : (
            <div className="space-y-2 pt-1">
              <Textarea value={answers[q.id] ?? q.ai_draft ?? ''} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder="Write an answer, or generate an AI draft…" className="text-sm min-h-[60px]" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busy === q.id} onClick={() => void draft(q.id)}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI draft
                </Button>
                <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" disabled={busy === q.id}
                  onClick={() => void answer(q.id, answers[q.id] ?? q.ai_draft ?? '')}>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Post answer
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Posts ───────────────────────────────────────────────────────────────────
function PostsTab({ workspaceId, locationId, locations }: { workspaceId: string; locationId: string; locations: Array<{ location_id: string; title: string | null }> }) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState('');
  const [topic, setTopic] = useState('STANDARD');
  const [target, setTarget] = useState(locationId !== 'all' ? locationId : (locations[0]?.location_id ?? ''));
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['gbp-posts', workspaceId, locationId],
    queryFn: () => fetch(`/api/gbp/posts?workspaceId=${workspaceId}&locationId=${locationId}`).then((r) => r.json()),
  });
  const posts = data?.posts ?? [];

  async function createAndPublish() {
    if (!summary.trim() || !target) { toast.error('Pick a location and write the post'); return; }
    setBusy(true);
    try {
      const { post: created } = await post('/api/gbp/posts', { workspaceId, locationId: target, topicType: topic, summary });
      await post(`/api/gbp/posts/${created.id}/publish`, { workspaceId });
      toast.success('Post published to Google');
      setSummary('');
      void qc.invalidateQueries({ queryKey: ['gbp-posts'] });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Publish failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900">New post</p>
        <div className="flex gap-3">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>{locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.title ?? l.location_id}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="STANDARD">Update</SelectItem>
              <SelectItem value="OFFER">Offer</SelectItem>
              <SelectItem value="EVENT">Event</SelectItem>
              <SelectItem value="ALERT">Alert</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What do you want to share?" className="text-sm min-h-[80px]" />
        <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white" disabled={busy} onClick={() => void createAndPublish()}>
          <Send className="h-3.5 w-3.5 mr-1.5" /> {busy ? 'Publishing…' : 'Publish'}
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-24 w-full" /> : posts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No posts yet.</p>
      ) : posts.map((p: any) => (
        <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase">{p.topic_type}</span>
            <Badge variant="outline" className={`text-xs ${p.status === 'published' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : p.status === 'failed' ? 'border-red-200 text-red-700 bg-red-50' : 'border-gray-200 text-gray-500'}`}>{p.status}</Badge>
          </div>
          <p className="text-sm text-gray-700">{p.summary}</p>
        </div>
      ))}
    </div>
  );
}

// ── Insights ────────────────────────────────────────────────────────────────
const METRIC_LABELS: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'Maps views (desktop)',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'Search views (desktop)',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'Maps views (mobile)',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'Search views (mobile)',
  BUSINESS_DIRECTION_REQUESTS: 'Direction requests',
  CALL_CLICKS: 'Calls',
  WEBSITE_CLICKS: 'Website clicks',
  BUSINESS_CONVERSATIONS: 'Messages',
};

function InsightsTab({ workspaceId, locationId }: { workspaceId: string; locationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['gbp-insights', workspaceId, locationId],
    queryFn: () => fetch(`/api/gbp/insights?workspaceId=${workspaceId}&locationId=${locationId}`).then((r) => r.json()),
  });
  const totals: Record<string, number> = data?.totals ?? {};
  const entries = Object.entries(totals);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (entries.length === 0) return <p className="text-sm text-gray-400 text-center py-12">No insights yet. Insights populate after a sync (last 30 days).</p>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {entries.map(([metric, value]) => (
        <div key={metric} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{Number(value).toLocaleString('en-IN')}</p>
          <p className="text-sm text-gray-500 mt-1">{METRIC_LABELS[metric] ?? metric}</p>
        </div>
      ))}
    </div>
  );
}
