'use client';

import { useState } from 'react';
import {
  User, Building2, MessageSquare, Shield, Clock,
  Zap, Webhook, MessagesSquare, Timer, Key, ScrollText, SlidersHorizontal, Tag, Layers, AlarmClock, ShoppingBag, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileSettings } from '../ProfileSettings';
import { WorkspaceSettings } from '../WorkspaceSettings';
import { WhatsAppSettings } from '../WhatsAppSettings';
import { InboxRules } from '../InboxRules';
import { FollowUpSequences } from '../FollowUpSequences';
import { IntegrationSettings } from '../IntegrationSettings';
import { WebhookSettings } from '../WebhookSettings';
import { QuickReplies } from '../QuickReplies';
import { BusinessHours } from '../BusinessHours';
import { ApiKeys } from '../ApiKeys';
import { AuditLogs } from '../AuditLogs';
import { SlaSettings } from '../SlaSettings';
import { LabelSettings } from '../LabelSettings';
import { CustomFieldSettings } from '../CustomFieldSettings';
import { TimeTriggerSettings } from '../TimeTriggerSettings';
import { QrCodeSettings } from '../QrCodeSettings';
import { LlmSettings } from '../LlmSettings';
import { BrandingSettings } from '../BrandingSettings';
import { BillingSettings } from '../BillingSettings';
import { MediaLibrary } from '../MediaLibrary';
import { CatalogSettings } from '../CatalogSettings';
import { AutomationTriggersSettings } from '../AutomationTriggersSettings';
import { ChatWidgetSettings } from '../ChatWidgetSettings';
import { WaFormsSettings } from '../WaFormsSettings';

type SettingKey =
  | 'profile' | 'workspace' | 'branding' | 'billing'
  | 'whatsapp' | 'business-hours' | 'quick-replies' | 'qr-code' | 'catalog' | 'media-library' | 'chat-widget' | 'wa-forms'
  | 'inbox-rules' | 'sequences' | 'sla' | 'labels' | 'custom-fields' | 'time-triggers' | 'auto-triggers'
  | 'integrations' | 'webhooks' | 'api-keys' | 'ai-models'
  | 'audit-logs';

interface NavSection {
  label: string;
  items: Array<{ key: SettingKey; label: string; icon: React.ElementType }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Account',
    items: [
      { key: 'profile',   label: 'Profile',   icon: User },
      { key: 'workspace', label: 'Workspace', icon: Building2 },
      { key: 'branding',  label: 'Branding',  icon: Layers },
      { key: 'billing',   label: 'Billing',   icon: Key },
    ],
  },
  {
    label: 'WhatsApp',
    items: [
      { key: 'whatsapp',       label: 'Configuration', icon: MessageSquare },
      { key: 'business-hours', label: 'Business Hours', icon: Clock },
      { key: 'quick-replies',  label: 'Quick Replies',  icon: MessagesSquare },
      { key: 'qr-code',        label: 'QR Code',        icon: Layers },
      { key: 'catalog',        label: 'Product Catalog', icon: ShoppingBag },
      { key: 'chat-widget',    label: 'Chat Widget',     icon: MessageSquare },
      { key: 'media-library',  label: 'Media Library',  icon: MessagesSquare },
    ],
  },
  {
    label: 'Automation',
    items: [
      { key: 'wa-forms',        label: 'WA Forms',       icon: FileText },
      { key: 'inbox-rules',    label: 'Inbox Rules',    icon: SlidersHorizontal },
      { key: 'sequences',      label: 'Follow-Up',      icon: Zap },
      { key: 'sla',            label: 'SLA',            icon: Timer },
      { key: 'labels',         label: 'Labels',         icon: Tag },
      { key: 'custom-fields',  label: 'Custom Fields',  icon: Layers },
      { key: 'time-triggers',  label: 'Time Triggers',  icon: AlarmClock },
      { key: 'auto-triggers',  label: 'Auto Triggers',  icon: Zap },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { key: 'integrations', label: 'Integrations', icon: Shield },
      { key: 'webhooks',     label: 'Webhooks',     icon: Webhook },
      { key: 'api-keys',     label: 'API Keys',     icon: Key },
      { key: 'ai-models',    label: 'AI Models',    icon: Zap },
    ],
  },
  {
    label: 'Admin',
    items: [
      { key: 'audit-logs', label: 'Audit Logs', icon: ScrollText },
    ],
  },
];

const CONTENT_MAP: Record<SettingKey, React.ReactNode> = {
  'profile':        <ProfileSettings />,
  'workspace':      <WorkspaceSettings />,
  'branding':       <BrandingSettings />,
  'billing':        <BillingSettings />,
  'whatsapp':       <WhatsAppSettings />,
  'business-hours': <BusinessHours />,
  'quick-replies':  <QuickReplies />,
  'inbox-rules':    <InboxRules />,
  'sequences':      <FollowUpSequences />,
  'sla':            <SlaSettings />,
  'labels':         <LabelSettings />,
  'custom-fields':  <CustomFieldSettings />,
  'time-triggers':  <TimeTriggerSettings />,
  'qr-code':        <QrCodeSettings />,
  'integrations':   <IntegrationSettings />,
  'webhooks':       <WebhookSettings />,
  'api-keys':       <ApiKeys />,
  'ai-models':      <LlmSettings />,
  'catalog':        <CatalogSettings />,
  'auto-triggers':  <AutomationTriggersSettings />,
  'chat-widget':    <ChatWidgetSettings />,
  'wa-forms':       <WaFormsSettings />,
  'media-library':  <MediaLibrary />,
  'audit-logs':     <AuditLogs />,
};

export function SettingsLayout() {
  const [active, setActive] = useState<SettingKey>('profile');

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left nav */}
      <aside className="w-56 shrink-0 border-r border-border bg-card overflow-y-auto py-6 px-3">
        <div className="mb-5 px-3">
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage your workspace</p>
        </div>

        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            {section.items.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  active === key
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {CONTENT_MAP[active]}
      </div>
    </div>
  );
}
