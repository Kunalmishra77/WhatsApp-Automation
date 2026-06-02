'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Play, Loader2, MoreVertical, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCampaigns, useRunCampaign, useDeleteCampaign } from '../../hooks/useCampaigns';
import { CampaignWizard } from '../CampaignWizard';
import { CAMPAIGN_STATUS_COLORS } from '../../services/campaign.service';
import { toast } from 'sonner';

export function CampaignList() {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);
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
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <h1 className="text-base font-semibold text-foreground">Campaigns</h1>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setWizardOpen(true)}>
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
              <TableHead className="w-20" />
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
                  // Use live stats from campaign_recipients; fall back to campaigns columns
                  const total     = c.live_total     ?? c.total_recipients ?? 0;
                  const sent      = c.live_sent      ?? c.sent_count       ?? 0;
                  const delivered = c.live_delivered ?? c.delivered_count  ?? 0;
                  const read      = c.live_read      ?? c.read_count       ?? 0;

                  const sentPct     = total > 0 ? Math.round((sent      / total)     * 100) : 0;
                  const deliveryPct = total > 0 ? Math.round((delivered / total)     * 100) : 0;
                  const readPct     = total > 0 ? Math.round((read      / total)     * 100) : 0;

                  return (
                    <TableRow
                      key={c.id}
                      className="hover:bg-accent cursor-pointer"
                      onClick={() => router.push(`/campaigns/${c.id}`)}
                    >
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
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
                        {c.scheduled_at ? format(new Date(c.scheduled_at), 'MMM d, HH:mm') : '—'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {(c.status === 'draft' || c.status === 'scheduled') && (
                            <Button
                              size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                              disabled={run.isPending}
                              onClick={(e) => void handleRun(e, c.id, c.name)}
                            >
                              {run.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                              Send
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
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
    </div>
  );
}
