'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Megaphone, Send } from 'lucide-react';

export default function CommunicationsPage() {
  const [form, setForm] = useState({ title: '', message: '', target_plan: 'all' });

  const sendMut = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return res.json();
    },
    onSuccess: (d: any) => {
      toast.success(`Announcement sent to ${d.sent_count ?? 0} clients!`);
      setForm({ title: '', message: '', target_plan: 'all' });
    },
    onError: () => toast.error('Failed to send'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
        <p className="text-sm text-gray-400 mt-0.5">Send announcements to all clients or specific plans</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 bg-orange-50 rounded-xl flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Send Announcement</h2>
            <p className="text-xs text-gray-400">Sends a WhatsApp message to all selected clients</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500">Title</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="New Feature Alert!" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Message</Label>
            <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="We just launched carousel templates! Try it in your Campaigns..." className="mt-1 min-h-[120px]" />
            <p className="text-xs text-gray-400 mt-1">{form.message.length} characters</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Target Audience</Label>
            <Select value={form.target_plan} onValueChange={v => setForm(f => ({ ...f, target_plan: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                <SelectItem value="enterprise">Enterprise Only</SelectItem>
                <SelectItem value="pro">Pro Only</SelectItem>
                <SelectItem value="starter">Starter Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button className="gap-2 text-white w-full" style={{ backgroundColor: '#F97316' }}
            disabled={sendMut.isPending || !form.title || !form.message}
            onClick={() => sendMut.mutate({ title: form.title, message: form.message, target_plan: form.target_plan === 'all' ? null : form.target_plan })}>
            <Send className="h-4 w-4" />
            {sendMut.isPending ? 'Sending...' : 'Send to All Clients via WhatsApp'}
          </Button>
        </div>
      </div>
    </div>
  );
}
