// lib/meta-spend.ts — pure helpers for the Meta Spend module. No I/O.

export interface SpendRow { day: string; category: string; volume: number; cost: number; currency: string }

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS));

export function dayFromBucket(startSec: number, endSec: number): string {
  const midMs = (startSec + (endSec - startSec) / 2) * 1000;
  return new Date(midMs).toISOString().slice(0, 10);
}

export function parsePricingAnalytics(
  json: unknown,
  currency: string,
): Array<{ day: string; category: string; volume: number; cost: number; currency: string }> {
  const points = (json as any)?.data?.[0]?.data_points;
  if (!Array.isArray(points)) return [];
  const out: Array<{ day: string; category: string; volume: number; cost: number; currency: string }> = [];
  for (const p of points) {
    if (typeof p?.start !== 'number' || typeof p?.end !== 'number') continue;
    out.push({
      day: dayFromBucket(p.start, p.end),
      category: String(p.pricing_category ?? 'UNKNOWN'),
      volume: Number(p.volume ?? 0),
      cost: Number(p.cost ?? 0),
      currency,
    });
  }
  return out;
}

export function resolveRange(quick: string, now: Date): { from: string; to: string } {
  const today = iso(now);
  const startOfWeek = (d: Date) => { const x = new Date(d); const dow = (x.getUTCDay() + 6) % 7; return addDays(iso(x), -dow); }; // Monday
  const startOfMonth = (d: Date) => iso(d).slice(0, 8) + '01';
  switch (quick) {
    case 'today':      return { from: today, to: today };
    case 'yesterday':  return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last_7_days':  return { from: addDays(today, -6), to: today };
    case 'this_week':  return { from: startOfWeek(now), to: today };
    case 'last_week':  { const s = addDays(startOfWeek(now), -7); return { from: s, to: addDays(s, 6) }; }
    case 'this_month': return { from: startOfMonth(now), to: today };
    case 'last_month': { const first = startOfMonth(now); const lastPrevEnd = addDays(first, -1); return { from: lastPrevEnd.slice(0, 8) + '01', to: lastPrevEnd }; }
    case 'last_90_days': return { from: addDays(today, -89), to: today };
    case 'this_year':  return { from: iso(now).slice(0, 4) + '-01-01', to: today };
    case 'last_30_days':
    default:           return { from: addDays(today, -29), to: today };
  }
}

export function sumCost(rows: SpendRow[], from: string, to: string): number {
  let t = 0;
  for (const r of rows) if (r.day >= from && r.day <= to) t += r.cost;
  return Math.round(t * 10000) / 10000;
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function bucketSeries(
  rows: SpendRow[], from: string, to: string, bucket: 'day' | 'week' | 'month',
): Array<{ label: string; cost: number }> {
  const key = (day: string) => {
    if (bucket === 'month') return day.slice(0, 7);
    if (bucket === 'week') { const dow = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7; return addDays(day, -dow); }
    return day;
  };
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    const k = key(r.day);
    map.set(k, (map.get(k) ?? 0) + r.cost);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, cost]) => ({ label, cost: Math.round(cost * 10000) / 10000 }));
}
