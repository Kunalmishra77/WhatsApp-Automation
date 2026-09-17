'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Check, Loader2 } from 'lucide-react';

export function ReferralForm({ code }: { code: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) { setError('Please enter your phone number'); return; }
    setSending(true); setError('');
    try {
      const res = await fetch('/api/referrals/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, phone }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Something went wrong');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setSending(false); }
  }

  return (
    <section className="relative -mt-16 min-h-[70vh] flex items-center justify-center bg-slate-900 px-4 py-24">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <Gift className="h-7 w-7 text-brand-500" />
        </div>
        {done ? (
          <>
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">You&apos;re in! 🎉</h1>
            <p className="mt-2 text-sm text-gray-500">Thanks for joining. We&apos;ll be in touch on WhatsApp with your welcome reward.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900">You&apos;ve been referred! 🎁</h1>
            <p className="mt-2 text-sm text-gray-500">A friend recommended us. Drop your details and we&apos;ll send your welcome reward on WhatsApp.</p>
            <form onSubmit={submit} className="mt-6 space-y-3 text-left">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="bg-white text-gray-900" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp number" className="bg-white text-gray-900" />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" disabled={sending} className="w-full bg-brand-500 hover:bg-brand-600 text-white">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim my reward'}
              </Button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
