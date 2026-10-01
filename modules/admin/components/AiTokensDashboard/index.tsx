'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cpu, Wallet, AlertTriangle, RefreshCw, LifeBuoy, Coins } from 'lucide-react';

interface WalletRow { provider: string; remaining: number | null; source: string; note?: string; low: boolean; threshold: number }
interface ProviderRow { provider: string; calls: number; total_tokens: number; cost_usd: number }
interface WorkspaceRow { workspace_id: string | null; name: string | null; calls: number; total_tokens: number; cost_usd: number }
interface UsageResponse {
  window: { days: number };
  wallet: WalletRow[];
  totals: { calls: number; total_tokens: number; cost_usd: number };
  by_provider: ProviderRow[];
  by_workspace: WorkspaceRow[];
}

const usd = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
const num = (n: number | null | undefined) => (n == null ? '0' : Number(n).toLocaleString('en-IN'));

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Request failed'); return d; });

export function AiTokensDashboard() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const [recovering, setRecovering] = useState(false);
  const [oaBalance, setOaBalance] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery<UsageResponse>({
    queryKey: ['admin-ai-usage', days],
    queryFn: () => fetch(`/api/admin/ai-usage?days=${days}`).then((r) => r.json()),
  });

  async function setOpenAiBalance() {
    const v = Number(oaBalance);
    if (!Number.isFinite(v) || v < 0) { toast.error('Enter a valid $ amount'); return; }
    try {
      await post('/api/admin/ai-usage', { provider: 'OpenAI', balance_usd: v });
      toast.success('OpenAI balance saved');
      setOaBalance('');
      void qc.invalidateQueries({ queryKey: ['admin-ai-usage'] });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  }

  async function recover() {
    setRecovering(true);
    try {
      const d = await post('/api/admin/recover-fallback', { window_hours: 72 });
      toast.success(`Recovery: ${d.sent} sent, ${d.skipped} skipped, ${d.failed} failed (of ${d.total})`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Recovery failed'); }
    finally { setRecovering(false); }
  }

  const totals = data?.totals ?? { calls: 0, total_tokens: 0, cost_usd: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Cpu className="h-6 w-6 text-orange-500" /> AI Tokens &amp; Wallet</h1>
          <p className="text-sm text-gray-400 mt-0.5">Token usage and cost per client, and your AI provider balances.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-lg border border-gray-200 px-2 text-sm">
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={() => void refetch()} disabled={isFetching} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm hover:bg-gray-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Wallet */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(data?.wallet ?? []).map((w) => (
          <div key={w.provider} className={`rounded-2xl border p-5 shadow-sm ${w.low ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className={`h-4 w-4 ${w.low ? 'text-red-500' : 'text-gray-400'}`} />
                <span className="text-sm font-semibold text-gray-900">{w.provider}</span>
              </div>
              {w.low && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700"><AlertTriangle className="h-3 w-3" /> Low — recharge</span>}
            </div>
            <p className="mt-3 text-3xl font-bold text-gray-900">{usd(w.remaining)}</p>
            <p className="mt-1 text-xs text-gray-500">{w.note ?? `Alert below $${w.threshold.toFixed(2)} · ${w.source}`}</p>
            {w.provider === 'OpenAI' && (
              <div className="mt-3 flex gap-2">
                <input value={oaBalance} onChange={(e) => setOaBalance(e.target.value)} placeholder="Set balance after recharge ($)" className="h-8 flex-1 rounded-md border border-gray-200 px-2 text-xs" />
                <button onClick={() => void setOpenAiBalance()} className="h-8 rounded-md bg-orange-500 px-3 text-xs font-medium text-white hover:bg-orange-600">Save</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: 'Total cost', value: usd(totals.cost_usd), icon: Coins },
          { label: 'Total tokens', value: num(totals.total_tokens), icon: Cpu },
          { label: 'AI calls', value: num(totals.calls), icon: RefreshCw },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <k.icon className="h-4 w-4 text-gray-300" />
            {isLoading ? <div className="mt-2 h-7 w-20 animate-pulse rounded bg-gray-100" /> : <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{k.value}</p>}
            <p className="text-sm text-gray-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Per provider */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">By provider</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs text-gray-500">
              <th className="text-left px-5 py-2 font-medium">Provider</th><th className="text-right px-4 py-2 font-medium">Calls</th><th className="text-right px-4 py-2 font-medium">Tokens</th><th className="text-right px-5 py-2 font-medium">Cost</th>
            </tr></thead>
            <tbody>
              {(data?.by_provider ?? []).map((p) => (
                <tr key={p.provider} className="border-t border-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-800">{p.provider}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(p.calls)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(p.total_tokens)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{usd(p.cost_usd)}</td>
                </tr>
              ))}
              {!isLoading && (data?.by_provider ?? []).length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No usage recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per client */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">By client (token spend)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs text-gray-500">
              <th className="text-left px-5 py-2 font-medium">Client</th><th className="text-right px-4 py-2 font-medium">Calls</th><th className="text-right px-4 py-2 font-medium">Tokens</th><th className="text-right px-5 py-2 font-medium">Cost</th>
            </tr></thead>
            <tbody>
              {(data?.by_workspace ?? []).map((w) => (
                <tr key={w.workspace_id ?? 'none'} className="border-t border-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-800">{w.name ?? (w.workspace_id ? 'Unknown' : 'Platform / untagged')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(w.calls)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(w.total_tokens)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{usd(w.cost_usd)}</td>
                </tr>
              ))}
              {!isLoading && (data?.by_workspace ?? []).length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No usage recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recovery tool */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <LifeBuoy className="h-4 w-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Recover fallback replies</p>
            <p className="text-xs text-gray-500 mt-0.5">After recharging tokens, re-send a real AI reply to anyone who got the generic fallback (last 72h, within WhatsApp&apos;s 24h window). Safe to run multiple times.</p>
          </div>
        </div>
        <button onClick={() => void recover()} disabled={recovering} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
          {recovering ? 'Recovering…' : 'Run recovery'}
        </button>
      </div>
    </div>
  );
}
