// lib/date-range.ts — one timezone-aware date-range resolver reused across the app.
// No tz library: offsets come from Intl.DateTimeFormat. Correct for fixed-offset zones
// (IST has no DST); documented as approximate at DST transitions for other zones.

export type QuickRange =
  | 'today' | 'yesterday'
  | 'last_7_days' | 'last_15_days' | 'last_30_days'
  | 'last_3_months' | 'last_6_months' | 'last_12_months'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter'
  | 'this_half_year' | 'last_half_year'
  | 'this_year' | 'last_year'
  | 'all_time' | 'custom';

export interface DateRange { from: string; to: string; fromUtc: string; toUtc: string }

const DEFAULT_TZ = 'Asia/Kolkata';

export const QUICK_RANGES: ReadonlyArray<{ key: QuickRange; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'last_15_days', label: 'Last 15 Days' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'last_12_months', label: 'Last 12 Months' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'last_quarter', label: 'Last Quarter' },
  { key: 'this_half_year', label: 'This Half-Year' },
  { key: 'last_half_year', label: 'Last Half-Year' },
  { key: 'this_year', label: 'This Year' },
  { key: 'last_year', label: 'Last Year' },
  { key: 'all_time', label: 'All Time' },
];

export function todayInTz(now: Date, tz: string): string {
  // en-CA → 'YYYY-MM-DD'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// Calendar arithmetic on a 'YYYY-MM-DD' string via a UTC-noon anchor (DST-safe for date math).
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// UTC instant of local 00:00 of `dateStr` in `tz`, using the tz's offset for that date.
export function zonedDayStartUtc(dateStr: string, tz: string): string {
  const asIfUtc = new Date(dateStr + 'T00:00:00.000Z');
  const tzWall = new Date(asIfUtc.toLocaleString('en-US', { timeZone: tz }));
  const utcWall = new Date(asIfUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = tzWall.getTime() - utcWall.getTime();
  return new Date(asIfUtc.getTime() - offsetMs).toISOString();
}

function parts(dateStr: string) {
  const segs = dateStr.split('-');
  const y = Number(segs[0]), m = Number(segs[1]), d = Number(segs[2]);
  return { y, m, d };
}
function firstOfMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function resolveRange(
  quick: QuickRange,
  opts: { tz?: string; now?: Date; from?: string; to?: string } = {},
): DateRange {
  const tz = opts.tz || DEFAULT_TZ;
  const now = opts.now || new Date();
  const today = todayInTz(now, tz);
  const { y, m } = parts(today);

  let from = today, to = today;

  switch (quick) {
    case 'today': break;
    case 'yesterday': from = to = addDays(today, -1); break;
    case 'last_7_days': from = addDays(today, -6); break;
    case 'last_15_days': from = addDays(today, -14); break;
    case 'last_30_days': from = addDays(today, -29); break;
    case 'last_3_months': from = addDays(today, -89); break;
    case 'last_6_months': from = addDays(today, -179); break;
    case 'last_12_months': from = addDays(today, -364); break;
    case 'this_week': {
      const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0=Sun..6=Sat
      from = addDays(today, -((dow + 6) % 7)); // Monday
      break;
    }
    case 'last_week': {
      const dow = new Date(today + 'T12:00:00Z').getUTCDay();
      const thisMon = addDays(today, -((dow + 6) % 7));
      from = addDays(thisMon, -7); to = addDays(thisMon, -1); break;
    }
    case 'this_month': from = firstOfMonth(y, m); break;
    case 'last_month': {
      const pm = m === 1 ? 12 : m - 1; const py = m === 1 ? y - 1 : y;
      from = firstOfMonth(py, pm); to = addDays(firstOfMonth(y, m), -1); break;
    }
    case 'this_quarter': { const qs = Math.floor((m - 1) / 3) * 3 + 1; from = firstOfMonth(y, qs); break; }
    case 'last_quarter': {
      const qs = Math.floor((m - 1) / 3) * 3 + 1;
      const lqs = qs === 1 ? 10 : qs - 3; const lqy = qs === 1 ? y - 1 : y;
      from = firstOfMonth(lqy, lqs); to = addDays(firstOfMonth(y, qs), -1); break;
    }
    case 'this_half_year': from = firstOfMonth(y, m <= 6 ? 1 : 7); break;
    case 'last_half_year': {
      if (m <= 6) { from = firstOfMonth(y - 1, 7); to = `${y - 1}-12-31`; }
      else { from = firstOfMonth(y, 1); to = `${y}-06-30`; }
      break;
    }
    case 'this_year': from = firstOfMonth(y, 1); break;
    case 'last_year': from = `${y - 1}-01-01`; to = `${y - 1}-12-31`; break;
    case 'all_time':
      return { from: '1970-01-01', to, fromUtc: '1970-01-01T00:00:00.000Z', toUtc: zonedDayStartUtc(addDays(today, 1), tz) };
    case 'custom':
      from = opts.from || today; to = opts.to || today; break;
  }

  return { from, to, fromUtc: zonedDayStartUtc(from, tz), toUtc: zonedDayStartUtc(addDays(to, 1), tz) };
}
