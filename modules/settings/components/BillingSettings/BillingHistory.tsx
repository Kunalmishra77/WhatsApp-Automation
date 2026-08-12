'use client';

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { rupees } from '@/lib/billing';
import { cn } from '@/lib/utils';

interface PaymentRow {
  invoice_no: string | null;
  total_paise: number;
  status: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  captured: 'bg-emerald-100 text-emerald-700 border-0',
  created: 'bg-gray-100 text-gray-600 border-0',
  failed: 'bg-red-100 text-red-700 border-0',
  refunded: 'bg-amber-100 text-amber-700 border-0',
};

function formatDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function BillingHistory({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No payments yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p, i) => (
          <TableRow key={p.invoice_no ?? `${p.period_start ?? 'row'}-${i}`}>
            <TableCell className="font-mono text-xs">{p.invoice_no ?? '—'}</TableCell>
            <TableCell>₹{rupees(p.total_paise)}</TableCell>
            <TableCell>
              <Badge className={cn('text-[10px] capitalize', STATUS_STYLES[p.status] ?? 'bg-gray-100 text-gray-600 border-0')}>
                {p.status}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{formatDate(p.paid_at ?? p.period_start)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
