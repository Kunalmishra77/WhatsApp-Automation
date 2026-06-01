'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Clock, Loader2, Save } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { cn } from '@/lib/utils';

interface DaySchedule { day: number; is_open: boolean; open: string; close: string; }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Bangkok',
  'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles',
  'Australia/Sydney', 'Pacific/Auckland',
];

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { day: 0, is_open: false, open: '09:00', close: '18:00' },
  { day: 1, is_open: true,  open: '09:00', close: '18:00' },
  { day: 2, is_open: true,  open: '09:00', close: '18:00' },
  { day: 3, is_open: true,  open: '09:00', close: '18:00' },
  { day: 4, is_open: true,  open: '09:00', close: '18:00' },
  { day: 5, is_open: true,  open: '09:00', close: '18:00' },
  { day: 6, is_open: true,  open: '09:00', close: '13:00' },
];

export function BusinessHours() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [awayMessage, setAwayMessage] = useState(
    'We are currently closed. Our support hours are Monday to Saturday, 10AM to 6PM IST. We will respond to your message as soon as we are back! 🙏',
  );
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/business-hours?workspaceId=${workspaceId}`);
        const data = await res.json() as { config?: { is_enabled: boolean; timezone: string; away_message: string; schedule: DaySchedule[] } };
        if (data.config) {
          setIsEnabled(data.config.is_enabled);
          setTimezone(data.config.timezone);
          setAwayMessage(data.config.away_message);
          setSchedule(data.config.schedule);
        }
      } finally { setIsLoading(false); }
    })();
  }, [workspaceId]);

  const updateDay = (day: number, field: keyof DaySchedule, value: boolean | string) => {
    setSchedule((prev) => prev.map((d) => d.day === day ? { ...d, [field]: value } : d));
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/business-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, timezone, isEnabled, awayMessage, schedule }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Business hours saved');
    } catch { toast.error('Failed to save'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-brand-500" />
            Business Hours
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Outside these hours, the bot sends an away message instead of AI auto-reply.
          </p>
        </div>
        <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Save</>}
        </Button>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Enable Business Hours</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When on, customers outside hours get the away message automatically.
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <Label>Timezone</Label>
        <select
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Weekly schedule */}
      <div className="space-y-2">
        <Label>Weekly Schedule</Label>
        <div className="rounded-xl border border-border overflow-hidden">
          {schedule.map((day, idx) => (
            <div
              key={day.day}
              className={cn(
                'flex items-center gap-4 px-4 py-3',
                idx < schedule.length - 1 && 'border-b border-border',
                !day.is_open && 'bg-muted/30',
              )}
            >
              <Switch
                checked={day.is_open}
                onCheckedChange={(v) => updateDay(day.day, 'is_open', v)}
                className="shrink-0"
              />
              <span className={cn('w-24 text-sm', !day.is_open && 'text-muted-foreground')}>
                {DAYS[day.day]}
              </span>
              {day.is_open ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={day.open}
                    onChange={(e) => updateDay(day.day, 'open', e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input
                    type="time"
                    value={day.close}
                    onChange={(e) => updateDay(day.day, 'close', e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Away message */}
      <div className="space-y-1.5">
        <Label>Away Message</Label>
        <Textarea
          rows={4}
          value={awayMessage}
          onChange={(e) => setAwayMessage(e.target.value)}
          placeholder="Message sent to customers outside business hours…"
        />
        <p className="text-[11px] text-muted-foreground">{awayMessage.length} characters — This message is sent automatically when a customer messages outside business hours.</p>
      </div>
    </div>
  );
}
