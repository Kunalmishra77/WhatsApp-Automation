'use client';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TERMS, rupees, type Term } from '@/lib/billing';

export interface PriceMatrixRow {
  key: string;
  term: Term;
  months: number;
  total_paise: number;
  original_total_paise: number | null;
  label: string;
}

// TERMS is a Record (unordered by spec), so the display order is pinned here
// to the Monthly → Quarterly → 6 Months → 1 Year sequence the brief calls for.
const TERM_ORDER: Term[] = ['monthly', 'quarterly', 'half_yearly', 'yearly'];

interface TermSelectorProps {
  /** price_matrix rows already filtered to the current channel (whatsapp / whatsapp_instagram). */
  rows: PriceMatrixRow[];
  value: Term;
  onChange: (term: Term) => void;
  disabled?: boolean;
}

function hasOffer(row: PriceMatrixRow): boolean {
  return row.original_total_paise != null && row.original_total_paise > row.total_paise;
}

// Dropdown term picker. The trigger renders the selected row's own pay/struck
// price directly (rather than relying on Radix's SelectValue text-echo) so it
// can show the same struck-original + price styling as each menu item.
export function TermSelector({ rows, value, onChange, disabled }: TermSelectorProps) {
  const byTerm = new Map(rows.map((r) => [r.term, r]));
  const ordered = TERM_ORDER.map((t) => byTerm.get(t)).filter((r): r is PriceMatrixRow => !!r);
  const selected = byTerm.get(value) ?? ordered[0];

  if (ordered.length === 0 || !selected) return null;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Billing term</label>
      <Select value={selected.term} onValueChange={(v) => onChange(v as Term)} disabled={disabled}>
        <SelectTrigger className="h-auto py-2">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{TERMS[selected.term].label}</span>
            <span className="text-sm text-muted-foreground">₹{rupees(selected.total_paise)}</span>
            {hasOffer(selected) && (
              <s className="text-xs text-muted-foreground/70">₹{rupees(selected.original_total_paise as number)}</s>
            )}
          </span>
        </SelectTrigger>
        <SelectContent>
          {ordered.map((row) => (
            <SelectItem key={row.term} value={row.term}>
              <span className="flex items-center gap-2 pr-2">
                <span className="font-medium">{TERMS[row.term].label}</span>
                <span className="text-muted-foreground">₹{rupees(row.total_paise)}</span>
                {hasOffer(row) && (
                  <>
                    <s className="text-xs text-muted-foreground/70">₹{rupees(row.original_total_paise as number)}</s>
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
                      Save ₹{rupees((row.original_total_paise as number) - row.total_paise)}
                    </Badge>
                  </>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
