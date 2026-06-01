'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '../ProfileSettings';
import { WorkspaceSettings } from '../WorkspaceSettings';
import { WhatsAppSettings } from '../WhatsAppSettings';
import { InboxRules } from '../InboxRules';
import { FollowUpSequences } from '../FollowUpSequences';
import { IntegrationSettings } from '../IntegrationSettings';

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
      </Tabs>
    </div>
  );
}
