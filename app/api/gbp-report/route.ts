import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { searchPlace, placeToSignals } from '@/lib/places';
import { computeGbpReport } from '@/lib/gbp-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/gbp-report   (PUBLIC — lead magnet)
// Body: { query: string, contact?: { name?, email?, phone? } }
// Runs a public Places lookup, scores the profile, optionally captures the lead.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      query?: string;
      contact?: { name?: string; email?: string; phone?: string };
    };
    const query = (body.query ?? '').trim();
    if (query.length < 3) return NextResponse.json({ error: 'Enter your business name and city' }, { status: 400 });

    const found = await searchPlace(query);
    if (!found.ok) {
      const status = found.error === 'not_configured' ? 503 : found.error === 'not_found' ? 404 : 502;
      const msg = found.error === 'not_found'
        ? "We couldn't find that business on Google. Try adding your city."
        : found.error === 'not_configured'
        ? 'The GBP report tool is not configured yet.'
        : 'Could not fetch business data right now. Please try again.';
      return NextResponse.json({ error: msg }, { status });
    }

    const place = found.data;
    const report = computeGbpReport(placeToSignals(place));

    // Capture the lead when contact details are supplied.
    const c = body.contact;
    if (c && (c.email?.trim() || c.phone?.trim())) {
      try {
        const db = createAdminClient() as any;
        await db.from('gbp_report_leads').insert({
          business_name: report.name,
          place_id: place.id ?? null,
          query,
          score: report.score,
          grade: report.grade,
          rating: report.rating,
          review_count: report.reviewCount,
          contact_name: c.name?.trim() ?? null,
          contact_email: c.email?.trim() ?? null,
          contact_phone: c.phone?.trim() ?? null,
          report,
        });
      } catch (e) {
        console.error('[gbp-report lead]', e);
        // don't fail the report if lead capture hiccups
      }
    }

    return NextResponse.json({
      report,
      place: {
        name: report.name,
        address: place.formattedAddress ?? null,
        mapsUri: place.googleMapsUri ?? null,
        type: place.primaryTypeDisplayName?.text ?? null,
      },
    });
  } catch (err) {
    console.error('[gbp-report]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
