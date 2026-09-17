'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X, Search, Loader2, MapPin, Sparkles } from 'lucide-react';

interface Finding { key: string; ok: boolean; label: string; tip: string }
interface Report { name: string; score: number; grade: 'A' | 'B' | 'C' | 'D'; rating: number | null; reviewCount: number; findings: Finding[] }
interface Place { name: string; address: string | null; mapsUri: string | null; type: string | null }

const GRADE_COLOR: Record<string, string> = {
  A: 'text-emerald-600', B: 'text-lime-600', C: 'text-amber-600', D: 'text-red-600',
};
const RING_COLOR: Record<string, string> = {
  A: 'stroke-emerald-500', B: 'stroke-lime-500', C: 'stroke-amber-500', D: 'stroke-red-500',
};

async function run(body: unknown) {
  const res = await fetch('/api/gbp-report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data as { report: Report; place: Place };
}

export function GbpReportTool() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [place, setPlace] = useState<Place | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function getReport(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) { setError('Enter your business name and city'); return; }
    setLoading(true); setError(''); setReport(null); setPlace(null); setSent(false);
    try {
      const d = await run({ query });
      setReport(d.report); setPlace(d.place);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() && !email.trim()) { setError('Add a phone or email so we can send your plan'); return; }
    setSending(true); setError('');
    try {
      await run({ query, contact: { name, phone, email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setSending(false); }
  }

  const circumference = 2 * Math.PI * 52;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Search */}
      <form onSubmit={getReport} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Your business name + city (e.g. Razorveda, Delhi)"
            className="h-12 pl-9 text-base bg-white text-gray-900"
          />
        </div>
        <Button type="submit" disabled={loading} className="h-12 px-6 bg-brand-500 hover:bg-brand-600 text-white text-base">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get my free report'}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {/* Report */}
      {report && (
        <div className="mt-8 rounded-2xl bg-white p-6 sm:p-8 shadow-xl text-gray-900">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-lg font-bold">{place?.name ?? report.name}</p>
              {place?.address && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="h-3.5 w-3.5" /> {place.address}
                </p>
              )}
              <p className="mt-2 text-sm text-gray-600">
                {report.rating != null ? `${report.rating.toFixed(1)}★ · ` : ''}{report.reviewCount} reviews
              </p>
            </div>
            {/* Score gauge */}
            <div className="relative h-32 w-32 shrink-0">
              <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" strokeWidth="12" className="stroke-gray-100" />
                <circle
                  cx="60" cy="60" r="52" fill="none" strokeWidth="12" strokeLinecap="round"
                  className={RING_COLOR[report.grade]}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - report.score / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-extrabold ${GRADE_COLOR[report.grade]}`}>{report.score}</span>
                <span className="text-xs text-gray-400">/ 100</span>
              </div>
            </div>
          </div>

          {/* Findings */}
          <div className="mt-6 space-y-2.5">
            {report.findings.map((f) => (
              <div key={f.key} className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${f.ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {f.ok ? <Check className="h-3 w-3 text-emerald-600" /> : <X className="h-3 w-3 text-red-600" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{f.label}</p>
                  {!f.ok && <p className="text-xs text-gray-500">{f.tip}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Lead capture */}
          <div className="mt-7 rounded-xl bg-brand-50 p-5">
            {sent ? (
              <div className="text-center py-2">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="font-semibold text-gray-900">Thank you! 🎉</p>
                <p className="text-sm text-gray-600 mt-1">Our team will reach out with your personalised plan to get more customers from Google.</p>
              </div>
            ) : (
              <>
                <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                  <Sparkles className="h-4 w-4 text-brand-500" /> Want us to fix these and get you more customers?
                </p>
                <p className="text-sm text-gray-600 mt-1 mb-3">Get a free action plan — we&apos;ll show you exactly what to improve.</p>
                <form onSubmit={submitLead} className="grid sm:grid-cols-3 gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="bg-white text-gray-900" />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone / WhatsApp" className="bg-white text-gray-900" />
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="bg-white text-gray-900" />
                  <Button type="submit" disabled={sending} className="sm:col-span-3 bg-brand-500 hover:bg-brand-600 text-white">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send me my free action plan'}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
