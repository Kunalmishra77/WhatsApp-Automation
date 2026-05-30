'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCampaigns } from '../../hooks/useCampaigns';
import { CampaignWizard } from '../CampaignWizard';
import { CAMPAIGN_STATUS_COLORS } from '../../services/campaign.service';

export function CampaignList() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data: campaigns = [], isLoading } = useCampaigns();

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
              <TableHead>Delivery</TableHead>
              <TableHead>Read Rate</TableHead>
              <TableHead>Scheduled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : campaigns.map((c) => {
                  const deliveryPct = c.total_recipients > 0
                    ? Math.round((c.delivered_count / c.total_recipients) * 100)
                    : 0;
                  const readPct = c.delivered_count > 0
                    ? Math.round((c.read_count / c.delivered_count) * 100)
                    : 0;
                  return (
                    <TableRow key={c.id} className="hover:bg-accent">
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {c.templates?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', CAMPAIGN_STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-600')}>
                          {c.status}
                        </span>
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
