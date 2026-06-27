'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CreditCard, Save } from 'lucide-react';

const DEFAULT_RATES = { marketing: 0.58, utility: 0.14, auth: 0.14, service: 0.29 };

export default function SettingsPage() {
  const [rates, setRates] = useState(DEFAULT_RATES);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Platform configuration</p>
      </div>

      {/* Meta Payment Setup */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <CreditCard className="h-5 w-5" style={{ color: '#F97316' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Meta Payment Setup</h2>
            <p className="text-xs text-gray-400">Primary card & per-conversation rates (INR)</p>
          </div>
        </div>

        {/* Primary card info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Primary Payment Card</p>
          <p className="text-sm text-gray-700">Add Agentix&apos;s payment card to each client&apos;s WABA via Meta Business Manager.</p>
          <p className="text-xs text-gray-400 mt-1">Meta → Business Settings → WhatsApp Accounts → [Client] → Payment Settings</p>
        </div>

        {/* Rates */}
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(rates) as Array<keyof typeof rates>).map(key => (
            <div key={key}>
              <Label className="text-xs text-gray-500 capitalize">{key} (₹ per conversation)</Label>
              <Input
                type="number" step="0.01"
                value={rates[key]}
                onChange={e => setRates(r => ({ ...r, [key]: Number(e.target.value) }))}
                className="mt-1"
              />
            </div>
          ))}
        </div>

        <Button className="mt-4 gap-2 text-white" style={{ backgroundColor: '#F97316' }}
          onClick={() => toast.success('Rates saved')}>
          <Save className="h-4 w-4" /> Save Rates
        </Button>
      </div>
    </div>
  );
}
