'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '../ProfileSettings';
import { WorkspaceSettings } from '../WorkspaceSettings';
import { WhatsAppSettings } from '../WhatsAppSettings';
import { InboxRules } from '../InboxRules';
import { FollowUpSequences } from '../FollowUpSequences';
import { IntegrationSettings } from '../IntegrationSettings';
import { KnowledgeBase } from '../KnowledgeBase';
import { WebhookSettings } from '../WebhookSettings';
import { QuickReplies } from '../QuickReplies';
import { BusinessHours } from '../BusinessHours';
import { ApiKeys } from '../ApiKeys';
import { AuditLogs } from '../AuditLogs';
import { SlaSettings } from '../SlaSettings';

export function SettingsLayout() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and workspace.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="inbox-rules">Inbox Rules</TabsTrigger>
          <TabsTrigger value="sequences">Follow-Up</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="knowledge-base">Knowledge Base</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="quick-replies">Quick Replies</TabsTrigger>
          <TabsTrigger value="business-hours">Business Hours</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="audit-logs">Audit Logs</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="workspace">
          <WorkspaceSettings />
        </TabsContent>
        <TabsContent value="whatsapp">
          <WhatsAppSettings />
        </TabsContent>
        <TabsContent value="inbox-rules">
          <InboxRules />
        </TabsContent>
        <TabsContent value="sequences">
          <FollowUpSequences />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationSettings />
        </TabsContent>
        <TabsContent value="knowledge-base">
          <KnowledgeBase />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhookSettings />
        </TabsContent>
        <TabsContent value="quick-replies">
          <QuickReplies />
        </TabsContent>
        <TabsContent value="business-hours">
          <BusinessHours />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeys />
        </TabsContent>
        <TabsContent value="audit-logs">
          <AuditLogs />
        </TabsContent>
        <TabsContent value="sla">
          <SlaSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
