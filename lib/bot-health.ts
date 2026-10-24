// lib/bot-health.ts
// Turns the raw per-client bot metrics into a verdict the admin panel can colour.
//
// The thresholds come from what production actually looked like either side of
// the September guardrail regression: refusals sat at 0% for months, then ran at
// 8-27%; median reply latency has held near 11s throughout; AI fallbacks are
// normally 0-2 a week and spiked to 60 a day during the 17-19 Oct provider
// outage. They are deliberately low — this is a watchdog, and a client noticing
// before we do is the failure it exists to prevent.

export interface BotHealthRow {
  workspace_id:     string;
  workspace_name:   string;
  inbound:          number;
  bot_replies:      number;
  refusals:         number;
  refused_contacts: number;
  fallbacks:        number;
  median_reply_sec: number | null;
}

export type Level = 'ok' | 'warn' | 'bad';

export interface BotHealthVerdict {
  refusalPct:   number;
  refusalLevel: Level;
  fallbackPerDay: number;
  fallbackLevel: Level;
  latencyLevel: Level;
  worst:        Level;
  /** Plain-language reason for the worst level, or null when healthy. */
  headline:     string | null;
}

export const THRESHOLDS = {
  refusalPctWarn:   5,
  refusalPctBad:    10,
  fallbackPerDayWarn: 1,
  fallbackPerDayBad:  5,
  latencySecWarn:   18,
  latencySecBad:    25,
} as const;

const worseOf = (a: Level, b: Level): Level =>
  a === 'bad' || b === 'bad' ? 'bad' : a === 'warn' || b === 'warn' ? 'warn' : 'ok';

export function assessBotHealth(row: BotHealthRow, days: number): BotHealthVerdict {
  // A handful of replies makes a percentage meaningless — one refusal out of
  // three is not a 33% problem. Below this, report healthy and let volume build.
  const MIN_REPLIES = 20;
  const enoughVolume = row.bot_replies >= MIN_REPLIES;

  const refusalPct = row.bot_replies > 0
    ? Math.round((row.refusals / row.bot_replies) * 1000) / 10
    : 0;

  const refusalLevel: Level = !enoughVolume ? 'ok'
    : refusalPct >= THRESHOLDS.refusalPctBad  ? 'bad'
    : refusalPct >= THRESHOLDS.refusalPctWarn ? 'warn'
    : 'ok';

  const fallbackPerDay = days > 0
    ? Math.round((row.fallbacks / days) * 10) / 10
    : row.fallbacks;

  const fallbackLevel: Level =
      fallbackPerDay >= THRESHOLDS.fallbackPerDayBad  ? 'bad'
    : fallbackPerDay >= THRESHOLDS.fallbackPerDayWarn ? 'warn'
    : 'ok';

  // No latency figure means nobody messaged this client in the window, which is
  // not a fault of the bot.
  const latencyLevel: Level = row.median_reply_sec === null ? 'ok'
    : row.median_reply_sec >= THRESHOLDS.latencySecBad  ? 'bad'
    : row.median_reply_sec >= THRESHOLDS.latencySecWarn ? 'warn'
    : 'ok';

  const worst = worseOf(worseOf(refusalLevel, fallbackLevel), latencyLevel);

  let headline: string | null = null;
  if (refusalLevel !== 'ok') {
    headline = `Turning customers away — ${refusalPct}% of replies refused (${row.refused_contacts} people)`;
  } else if (fallbackLevel !== 'ok') {
    headline = `AI failing — ${fallbackPerDay}/day fell back to "our team will get back to you"`;
  } else if (latencyLevel !== 'ok') {
    headline = `Slow — customers wait ${row.median_reply_sec}s for a reply`;
  }

  return { refusalPct, refusalLevel, fallbackPerDay, fallbackLevel, latencyLevel, worst, headline };
}
