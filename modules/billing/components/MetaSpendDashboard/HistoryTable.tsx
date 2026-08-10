'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { SpendHistoryRow } from '../../hooks/useMetaSpend';

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: 'Marketing', UTILITY: 'Utility', AUTHENTICATION: 'Authentication', SERVICE: 'Service',
};

function categoryLabel(c: string) {
  return CATEGORY_LABEL[c] ?? (c.charAt(0) + c.slice(1).toLowerCase());
}

export function HistoryTable({
  rows, loading, formatCurrency,
}: {
  rows: SpendHistoryRow[];
  loading: boolean;
  formatCurrency: (n: number) => string;
}) {
  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">No Meta billing data for this period.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Messages</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 100).map((r, i) => (
          <TableRow key={`${r.day}-${r.category}-${i}`}>
            <TableCell className="text-sm">{r.day}</TableCell>
            <TableCell><Badge variant="outline" className="font-normal">{categoryLabel(r.category)}</Badge></TableCell>
            <TableCell className="text-right tabular-nums">{r.volume.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCurrency(r.cost)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
