// lib/places.ts
// Google Places API (New) client — fetches PUBLIC business data for the Free
// GBP Report. Uses a simple API key (GOOGLE_PLACES_API_KEY), not OAuth.

import type { GbpSignals } from '@/lib/gbp-report';

const PLACES = 'https://places.googleapis.com/v1';
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.googleMapsUri',
  'places.rating', 'places.userRatingCount', 'places.websiteUri', 'places.nationalPhoneNumber',
  'places.regularOpeningHours', 'places.photos', 'places.businessStatus', 'places.editorialSummary',
  'places.primaryTypeDisplayName',
].join(',');

export interface PlaceResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: unknown;
  photos?: unknown[];
  businessStatus?: string;
  editorialSummary?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
}

export type PlacesResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function searchPlace(query: string): Promise<PlacesResult<PlaceResult>> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return { ok: false, error: 'not_configured' };
  try {
    const res = await fetch(`${PLACES}/places:searchText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1, languageCode: 'en' }),
    });
    if (!res.ok) return { ok: false, error: `places ${res.status}: ${await res.text()}` };
    const data = await res.json() as { places?: PlaceResult[] };
    const place = data.places?.[0];
    if (!place) return { ok: false, error: 'not_found' };
    return { ok: true, data: place };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

export function placeToSignals(p: PlaceResult): GbpSignals {
  return {
    name: p.displayName?.text ?? 'This business',
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviewCount: p.userRatingCount ?? 0,
    hasWebsite: !!p.websiteUri,
    hasPhone: !!p.nationalPhoneNumber,
    hasHours: !!p.regularOpeningHours,
    photoCount: Array.isArray(p.photos) ? p.photos.length : 0,
    hasDescription: !!p.editorialSummary?.text,
    isOperational: (p.businessStatus ?? 'OPERATIONAL') === 'OPERATIONAL',
  };
}
