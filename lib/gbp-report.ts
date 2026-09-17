// lib/gbp-report.ts
// Pure logic for the "Free GBP Report" lead magnet: score a Google Business
// Profile's completeness/health from PUBLIC Places data. No I/O here — the
// Places API call lives in lib/places.ts. Kept pure so scoring is unit-tested.

export interface GbpSignals {
  name: string;
  rating: number | null;        // 0..5
  reviewCount: number;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  photoCount: number;
  hasDescription: boolean;
  isOperational: boolean;
}

export interface GbpFinding {
  key: string;
  ok: boolean;
  label: string;
  tip: string;
}

export interface GbpReport {
  name: string;
  score: number;           // 0..100
  grade: 'A' | 'B' | 'C' | 'D';
  rating: number | null;
  reviewCount: number;
  findings: GbpFinding[];
}

function grade(score: number): GbpReport['grade'] {
  if (score >= 85) return 'A';
  if (score >= 65) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// Weighted health score out of 100.
export function computeGbpReport(s: GbpSignals): GbpReport {
  const findings: GbpFinding[] = [];
  let score = 0;

  // Website (15)
  const web = s.hasWebsite ? 15 : 0;
  score += web;
  findings.push({ key: 'website', ok: s.hasWebsite, label: 'Website linked',
    tip: s.hasWebsite ? 'Your website is linked.' : 'Add your website so customers can visit and book.' });

  // Phone (10)
  score += s.hasPhone ? 10 : 0;
  findings.push({ key: 'phone', ok: s.hasPhone, label: 'Phone number',
    tip: s.hasPhone ? 'A phone number is listed.' : 'Add a phone number so customers can call you.' });

  // Hours (15)
  score += s.hasHours ? 15 : 0;
  findings.push({ key: 'hours', ok: s.hasHours, label: 'Business hours',
    tip: s.hasHours ? 'Opening hours are set.' : 'Add opening hours — profiles with hours get more visits.' });

  // Description (10)
  score += s.hasDescription ? 10 : 0;
  findings.push({ key: 'description', ok: s.hasDescription, label: 'Business description',
    tip: s.hasDescription ? 'A description is present.' : 'Add a keyword-rich description to rank better.' });

  // Photos (20) — up to 10 photos count fully
  const photoPts = Math.min(s.photoCount, 10) * 2;
  score += photoPts;
  findings.push({ key: 'photos', ok: s.photoCount >= 5, label: `Photos (${s.photoCount})`,
    tip: s.photoCount >= 5 ? 'Good photo coverage.' : 'Add more photos — listings with 5+ photos get far more clicks.' });

  // Rating (15)
  const ratingPts = s.rating != null ? Math.round((s.rating / 5) * 15) : 0;
  score += ratingPts;
  findings.push({ key: 'rating', ok: (s.rating ?? 0) >= 4, label: s.rating != null ? `Rating ${s.rating.toFixed(1)}★` : 'No rating yet',
    tip: (s.rating ?? 0) >= 4 ? 'Strong rating.' : 'Ask happy customers to leave a 5★ review to lift your rating.' });

  // Review volume (15) — 50+ reviews counts fully
  const reviewPts = Math.round((Math.min(s.reviewCount, 50) / 50) * 15);
  score += reviewPts;
  findings.push({ key: 'reviews', ok: s.reviewCount >= 20, label: `${s.reviewCount} reviews`,
    tip: s.reviewCount >= 20 ? 'Healthy review volume.' : 'Get more reviews — volume builds trust and ranking.' });

  if (!s.isOperational) {
    findings.push({ key: 'status', ok: false, label: 'Marked closed/limited',
      tip: 'Your profile is not marked as operational — update your status.' });
    score = Math.round(score * 0.6);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { name: s.name, score, grade: grade(score), rating: s.rating, reviewCount: s.reviewCount, findings };
}
