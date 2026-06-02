'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Download, QrCode, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function QrCodeSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const [phone,   setPhone]   = useState('');
  const [message, setMessage] = useState('');
  const [qrUrl,   setQrUrl]   = useState<string | null>(null);
  const [waUrl,   setWaUrl]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!phone.trim()) { toast.error('Enter a phone number'); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceId, phone: phone.trim(), size: '350' });
      if (message.trim()) params.set('message', message.trim());
      const res = await fetch(`/api/qr-code?${params.toString()}`);
      const data = await res.json() as { qrUrl?: string; waUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setQrUrl(data.qrUrl ?? null);
      setWaUrl(data.waUrl ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `whatsapp-qr-${phone}.png`;
    a.target = '_blank';
    a.click();
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">QR Code Generator</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate WhatsApp QR codes for business cards, posters, and marketing materials.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4 space-y-4 bg-card">
        <div className="space-y-1.5">
          <Label htmlFor="qr-phone">WhatsApp Phone Number</Label>
          <Input
            id="qr-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
          <p className="text-xs text-muted-foreground">Include country code (e.g. +91 for India)</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-msg">Pre-filled Message (optional)</Label>
          <Textarea
            id="qr-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Hi, I'd like to know more about your services!"
            className="resize-none h-20 text-sm"
          />
        </div>
        <Button onClick={() => void generate()} disabled={!phone.trim() || loading} className="gap-1.5">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          {loading ? 'Generating…' : 'Generate QR Code'}
        </Button>
      </div>

      {qrUrl && (
        <div className="rounded-xl border border-border p-6 flex flex-col items-center gap-4 bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="WhatsApp QR Code" className="w-64 h-64 rounded-lg" />
          {waUrl && (
            <p className="text-xs text-muted-foreground text-center break-all">{waUrl}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" /> Download PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => { if (waUrl) { void navigator.clipboard.writeText(waUrl); toast.success('Link copied!'); } }}
            >
              Copy Link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
