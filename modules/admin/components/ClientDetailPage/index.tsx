'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, Wifi, WifiOff,
  LayoutDashboard, Smartphone, Send, Users, Ticket, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OverviewTab }   from './tabs/OverviewTab';
import { WhatsAppTab }   from './tabs/WhatsAppTab';
import { CampaignsTab }  from './tabs/CampaignsTab';
import { MembersTab }    from './tabs/MembersTab';
import { SupportTab }    from './tabs/SupportTab';
import { SettingsTab }   from './tabs/SettingsTab';

type Tab = 'overview' | 'whatsapp' | 'campaigns' | 'members' | 'support' | 'settings';

const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
  { key: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { key: 'whatsapp',   label: 'WhatsApp',   icon: Smartphone },
  { key: 'campaigns',  label: 'Campaigns',  icon: Send },
  { key: 'members',    label: 'Members',    icon: Users },
  { key: 'support',    label: 'Support',    icon: Ticket },
  { key: 'settings',   label: 'Settings',   icon: Shield },
];

const PLAN_COLORS: Record<string, string> = {
  enterprise: 'bg-amber-100 text-amber-700 border-amber-200',
  pro:        'bg-violet-100 text-violet-700 border-violet-200',
  starter:    'bg-blue-100 text-blue-700 border-blue-200',
  free:       'bg-gray-100 text-gray-600 border-gray-200',
};

export function ClientDetailPage({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<Tab>('overview');

  const { data: wsData, isLoading } = useQuery({
    queryKey: ['admin', 'workspace', workspaceId],
    queryFn:  () => fetch(`/api/admin/workspaces/${workspaceId}`).then(r => r.json()),
  });

  const ws = wsData?.workspace;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-32 bg-white rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!ws) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Workspace not found</p>
        <Link href="/admin/clients" className="text-sm text-orange-500 mt-2 inline-block">← Back to Clients</Link>
      </div>
    );
  }

  const isConnected = !!(ws.phone_number_id && ws.access_token);

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Link href="/admin/clients" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 w-fit">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
      </Link>

      {/* Client Header Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #F97316, #ea580c)' }}>
            {ws.name?.[0]?.toUpperCase() ?? 'W'}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{ws.name}</h1>
              <span className={cn('text-xs font-semibold rounded-full px-2.5 py-0.5 border', PLAN_COLORS[ws.plan] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                {ws.plan?.toUpperCase()}
              </span>
              <span className={cn('text-xs font-semibold rounded-full px-2.5 py-0.5',
                ws.is_active && ws.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                ws.subscription_status === 'halted' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                {ws.is_active && ws.subscription_status === 'active' ? 'Active' : ws.subscription_status ?? 'Unknown'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">/{ws.slug} · Client since {new Date(ws.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {ws.owner_email && <span className="text-xs text-gray-500">✉ {ws.owner_email}</span>}
              {ws.owner_phone && <span className="text-xs text-gray-500">📞 {ws.owner_phone}</span>}
              <span className={cn('flex items-center gap-1 text-xs font-medium', isConnected ? 'text-emerald-600' : 'text-red-500')}>
                {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {isConnected ? 'WhatsApp Connected' : 'WhatsApp Not Connected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-100">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 shrink-0',
                tab === key
                  ? 'border-[#F97316] text-[#F97316]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {tab === 'overview'  && <OverviewTab  workspaceId={workspaceId} workspace={ws} />}
          {tab === 'whatsapp'  && <WhatsAppTab  workspaceId={workspaceId} workspace={ws} />}
          {tab === 'campaigns' && <CampaignsTab workspaceId={workspaceId} />}
          {tab === 'members'   && <MembersTab   workspaceId={workspaceId} />}
          {tab === 'support'   && <SupportTab   workspaceId={workspaceId} />}
          {tab === 'settings'  && <SettingsTab  workspaceId={workspaceId} workspace={ws} />}
        </div>
      </div>
    </div>
  );
}
