'use client';

import { useState, useEffect } from 'react';
import { CalendarCheck, CalendarX, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/store/workspace.store';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';

export function GoogleCalendarSettings() {
  const workspaceId  = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [connected,  setConnected]  = useState(false);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const searchParams = useSearchParams();

  // Show toast based on OAuth redirect result
  useEffect(() => {
    const gcal = searchParams.get('gcal');
    if (gcal === 'success') toast.success('Google Calendar connected!');
    else if (gcal === 'error') toast.error('Google Calendar connection failed. Try again.');
    else if (gcal === 'no_refresh_token') toast.error('No refresh token received. Please disconnect any existing Google access and try again.');
  }, [searchParams]);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      try {
        const res  = await fetch(`/api/workspaces/${workspaceId}/settings`);
        const data = await res.json() as { settings?: Record<string, unknown> };
        const hasToken = !!(data?.settings?.google_calendar_refresh_token);
        setConnected(hasToken);
        setConnectedAt((data?.settings?.google_calendar_connected_at as string) ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  const handleConnect = () => {
    window.location.href = `/api/integrations/google-calendar/connect?workspaceId=${workspaceId}`;
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      setConnected(false);
      setConnectedAt(null);
      toast.success('Google Calendar disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Google Calendar</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Automatically create calendar events when a demo, callback, or appointment is detected in WhatsApp conversations.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : connected ? (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CalendarCheck className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Events will be created in your primary Google Calendar
                </p>
                {connectedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connected on {new Date(connectedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 shrink-0"
              onClick={() => void handleDisconnect()}
              disabled={disconnecting}
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarX className="h-3.5 w-3.5" />}
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Not connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect your Google account to auto-create calendar events from bookings
                </p>
              </div>
            </div>
            <Button size="sm" onClick={handleConnect} className="gap-1.5 shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
              Connect Google
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">What gets auto-created:</p>
        <p>• Demo confirmed → Calendar event with customer name, phone & location</p>
        <p>• Callback requested → Callback reminder event</p>
        <p>• Appointment set → Appointment event</p>
        <p>Each client workspace connects their own Google Calendar — fully isolated.</p>
      </div>
    </div>
  );
}
