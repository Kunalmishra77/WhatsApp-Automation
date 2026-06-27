'use client';

import { useQuery } from '@tanstack/react-query';
import { Ticket, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Ticket {
  id: string; title: string; status: string; priority: string;
  category: string; created_at: string;
  workspaces: { name: string } | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUS_COLOR: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-violet-100 text-violet-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-gray-100 text-gray-500',
};

export default function SupportPage() {
  const { data, isLoading } = useQuery<{ tickets: Ticket[] }>({
    queryKey: ['admin-tickets'],
    queryFn: () => fetch('/api/admin/support-tickets').then(r => r.json()),
  });

  const tickets = data?.tickets ?? [];
  const open = tickets.filter(t => t.status === 'open');
  const inProgress = tickets.filter(t => t.status === 'in_progress');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage client support requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open', value: open.length, icon: AlertCircle, color: 'text-blue-500' },
          { label: 'In Progress', value: inProgress.length, icon: Clock, color: 'text-violet-500' },
          { label: 'Total', value: tickets.length, icon: Ticket, color: 'text-gray-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <Icon className={`h-5 w-5 ${color}`} />
            <div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Ticket list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center text-gray-400 py-8">Loading...</td></tr>}
            {!isLoading && tickets.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No support tickets</p>
              </td></tr>
            )}
            {tickets.map(t => (
              <tr key={t.id} className="border-b border-gray-50 hover:bg-orange-50/20 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-800">{t.title}</td>
                <td className="px-4 py-3 text-gray-500">{t.workspaces?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-xs ${PRIORITY_COLOR[t.priority] ?? ''}`}>{t.priority}</Badge>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLOR[t.status] ?? ''}`}>{t.status.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(t.created_at).toLocaleDateString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
