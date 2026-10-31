// lib/meta-leads-filter.ts
//
// Filtering Meta ad leads by the platform they came from.
//
// It used to be done in JavaScript, after the database had already paginated:
// 25 rows fetched, some kept, and `total` / `totalPages` taken from the
// unfiltered count. So picking Instagram showed an almost-empty page and
// claimed 158 more of them. Every one of the platform's 3,952 ad leads is
// currently `facebook`, so the filter either returned everything or nothing —
// which is why nobody noticed, and why it would start mattering the day
// Instagram ads are switched on.
//
// The platform lives at `meta->ad_source->platform`, and the route's comment
// said that was "not filterable via PostgREST". It is:
// `meta->ad_source->>platform=eq.instagram`.
//
// Pure, because the facebook case has a wrinkle worth a test.

/** The platforms a Meta ad lead can come from. */
export const AD_PLATFORMS = ['facebook', 'instagram'] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

const PATH = 'meta->ad_source->>platform';

export function isAdPlatform(value: string | null | undefined): value is AdPlatform {
  return !!value && (AD_PLATFORMS as readonly string[]).includes(value);
}

/**
 * What to add to the query for a platform filter, or null to add nothing.
 *
 * `facebook` has to include rows where the key is missing, because that is what
 * the display does — `adSource.platform ?? 'facebook'`. Filtering on the stored
 * value alone would hide a lead the same page labels "facebook", which is worse
 * than not filtering: the client would conclude the lead had vanished.
 *
 * Returned as a description rather than applied here so this stays testable
 * without a database, and so the list route and the CSV export cannot drift.
 */
export function platformFilter(platform: string | null | undefined):
  | { kind: 'none' }
  | { kind: 'eq'; column: string; value: string }
  | { kind: 'or'; expression: string } {
  if (!isAdPlatform(platform)) return { kind: 'none' };

  if (platform === 'facebook') {
    return { kind: 'or', expression: `${PATH}.eq.facebook,${PATH}.is.null` };
  }
  return { kind: 'eq', column: PATH, value: platform };
}

/**
 * Applies the filter to a PostgREST query builder.
 *
 * Typed loosely on purpose: this is handed a Supabase builder, and the point of
 * the function is that both callers apply the same thing.
 */
export function applyPlatformFilter<T extends {
  eq: (column: string, value: string) => T;
  or: (expression: string) => T;
}>(query: T, platform: string | null | undefined): T {
  const filter = platformFilter(platform);
  if (filter.kind === 'eq') return query.eq(filter.column, filter.value);
  if (filter.kind === 'or') return query.or(filter.expression);
  return query;
}
