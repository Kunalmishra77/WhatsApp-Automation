'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Play, Loader2, MoreVertical, Trash2, FlaskConical, Trophy, TrendingUp, Megaphone } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCampaigns, useRunCampaign, useDeleteCampaign } from '../../hooks/useCampaigns';
import { CampaignWizard } from '../CampaignWizard';
import { CAMPAIGN_STATUS_COLORS } from '../../services/campaign.service';
import { toast } from 'sonner';

// ── A/B Comparison Dialog ────────────────────────────────────────────────────

interface ABVariant {
  id: string;
  name: string;
  group: string;
  status: string;
  template: string;
  stats: {
    total: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    delivery_rate: number;
    read_rate: number;
    reply_rate: number;
  };
}

function StatBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold w-9 text-right">{value}%</span>
    </div>
  );
}

function ABComparisonDialog({ campaignId, open, onClose }: { campaignId: string; open: boolean; onClose: () => void }) {
  const [data, setData]       = useState<{ variants: ABVariant[]; winner: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const load = async () => {
    if (!campaignId || data) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ab-comparison`);
      const json = await res.json() as { variants?: ABVariant[]; winner?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData({ variants: json.variants ?? [], winner: json.winner ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  // Load when dialog opens
  if (open && !data && !loading && !error) void load();
  if (!open && data) setData(null);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-purple-500" />
            A/B Test Comparison
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive py-4 text-center">{error}</p>
        )}

        {data && (
          <div className="space-y-4">
            {/* Winner banner */}
            {data.winner && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
                <Trophy className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  <strong>Winner:</strong>{' '}
                  {data.variants.find((v) => v.id === data.winner)?.name ?? 'Version A'}
                  {' '}— highest engagement
                </p>
              </div>
            )}

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-2 gap-4">
              {data.variants.map((v) => {
                const isWinner = v.id === data.winner;
                return (
                  <div
                    key={v.id}
                    className={cn(
                      'rounded-xl border p-4 space-y-3',
                      isWinner ? 'border-amber-300 bg-amber-50/50' : 'border-border bg-card',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-xs font-bold px-2 py-0.5 rounded-full',
                          v.group === 'A' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700',
                        )}>
                          Version {v.group}
                        </span>
                        {isWinner && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">{v.status}</Badge>
                    </div>

                    <div>
                      <p className="text-xs font-medium truncate">{v.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{v.template}</p>
                    </div>

                    <div className="space-y-2.5">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground">Delivered</span>
                          <span className="text-[11px] text-muted-foreground">{v.stats.delivered}/{v.stats.total}</span>
                        </div>
                        <StatBar value={v.stats.delivery_rate} color="bg-blue-500" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground">Read</span>
                          <span className="text-[11px] text-muted-foreground">{v.stats.read}/{v.stats.total}</span>
                        </div>
                        <StatBar value={v.stats.read_rate} color="bg-emerald-500" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />Reply Rate
                          </span>
                          <span className="text-[11px] text-muted-foreground">{v.stats.replied}/{v.stats.total}</span>
                        </div>
                        <StatBar value={v.stats.reply_rate} color="bg-purple-500" />
                      </div>
                    </div>

                    {v.stats.failed > 0 && (
                      <p className="text-[10px] text-red-500">{v.stats.failed} failed to send</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Insight */}
            {data.variants.length === 2 && (
              <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Key Takeaways</p>
                {(() => {
                  const [a, b] = data.variants;
                  if (!a || !b) return null;
                  const replyDiff = Math.abs(a.stats.reply_rate - b.stats.reply_rate);
                  const readDiff  = Math.abs(a.stats.read_rate - b.stats.read_rate);
                  return (
                    <>
                      {replyDiff > 0 && (
                        <p>Reply rate difference: <strong>{replyDiff}pp</strong> — Version {a.stats.reply_rate > b.stats.reply_rate ? 'A' : 'B'} performs better</p>
                      )}
                      {readDiff > 0 && (
                        <p>Read rate difference: <strong>{readDiff}pp</strong> — use the winning template for future campaigns</p>
                      )}
                      {replyDiff === 0 && readDiff === 0 && (
                        <p>Both versions performed identically — try different message content or CTAs next time</p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main CampaignList ────────────────────────────────────────────────────────

export function CampaignList() {
  const router = useRouter();
  const [wizardOpen, setWizardOpen]   = useState(false);
  const [abCampaignId, setAbCampaignId] = useState<string | null>(null);
  const { data: campaigns = [], isLoading } = useCampaigns();
  const run    = useRunCampaign();
  const remove = useDeleteCampaign();

  const handleRun = async (e: React.MouseEvent, campaignId: string, campaignName: string) => {
    e.stopPropagation();
    if (!confirm(`Send campaign "${campaignName}" to all audience contacts now?`)) return;
    try {
      const result = await run.mutateAsync(campaignId);
      toast.success(`Campaign sent! ${result.sent} sent, ${result.failed} failed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run campaign');
    }
  };

  const handleDelete = async (e: React.MouseEvent, campaignId: string, campaignName: string) => {
    e.stopPropagation();
    if (!confirm(`Delete campaign "${campaignName}"? This cannot be undone.`)) return;
    try {
      await remove.mutateAsync(campaignId);
      toast.success('Campaign deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete campaign');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between flex-wrap gap-3 border-b border-border bg-card px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 shrink-0">
            <Megaphone className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground leading-none">Campaigns</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Broadcast messages to your contacts</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setWizardOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Read Rate</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : campaigns.map((c) => {
                  const total     = c.live_total     ?? c.total_recipients ?? 0;
                  const sent      = c.live_sent      ?? c.sent_count       ?? 0;
                  const delivered = c.live_delivered ?? c.delivered_count  ?? 0;
                  const read      = c.live_read      ?? c.read_count       ?? 0;

                  const sentPct     = total > 0 ? Math.round((sent      / total) * 100) : 0;
                  const deliveryPct = total > 0 ? Math.round((delivered / total) * 100) : 0;
                  const readPct     = total > 0 ? Math.round((read      / total) * 100) : 0;
                  const isAB        = !!(c as any).ab_test_group;

                  return (
                    <TableRow
                      key={c.id}
                      className="hover:bg-accent cursor-pointer"
                      onClick={() => router.push(`/campaigns/${c.id}`)}
                    >
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-1.5">
                          {c.name}
                          {isAB && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                              A/B {(c as any).ab_test_group}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {c.templates?.name ?? <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', CAMPAIGN_STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-600')}>
                          {c.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {total > 0 ? `${sent}/${total} (${sentPct}%)` : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-24">
                          <Progress value={deliveryPct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground w-8">{deliveryPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{readPct}%</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST' : '—'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {c.status === 'draft' && (
                            <Button
                              size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                              disabled={run.isPending}
                              onClick={(e) => void handleRun(e, c.id, c.name)}
                            >
                              {run.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                              Send Now
                            </Button>
                          )}
                          {isAB && (
                            <Button
                              size="sm" variant="ghost" className="h-7 w-7 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                              title="View A/B comparison"
                              onClick={(e) => { e.stopPropagation(); setAbCampaignId(c.id); }}
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isAB && (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onSelect={() => setAbCampaignId(c.id)}
                                >
                                  <FlaskConical className="h-3.5 w-3.5 text-purple-500" /> View A/B Results
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive gap-2"
                                disabled={c.status === 'running' || remove.isPending}
                                onSelect={(e) => { void handleDelete(e as unknown as React.MouseEvent, c.id, c.name); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        {!isLoading && campaigns.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">No campaigns yet. Launch your first one.</p>
          </div>
        )}
      </div>

      <CampaignWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {abCampaignId && (
        <ABComparisonDialog
          campaignId={abCampaignId}
          open={!!abCampaignId}
          onClose={() => setAbCampaignId(null)}
        />
      )}
    </div>
  );
}
