'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, RefreshCw, Trash2, CheckCircle2, ExternalLink, Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CatalogProduct {
  id: string;
  retailer_id: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  image_url?: string;
  availability?: string;
}

export function CatalogSettings() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? '';
  const queryClient = useQueryClient();
  const [catalogIdInput, setCatalogIdInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/catalog?workspaceId=${workspaceId}`);
      if (!res.ok) return { catalog_id: null, products: [] };
      return res.json() as Promise<{ catalog_id: string | null; products: CatalogProduct[] }>;
    },
    enabled: !!workspaceId,
  });

  const catalogId = data?.catalog_id;
  const products  = data?.products ?? [];

  const handleConnect = async () => {
    const id = catalogIdInput.trim();
    if (!id) { toast.error('Enter a Catalog ID'); return; }
    setConnecting(true);
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, catalogId: id }),
      });
      const data = await res.json() as { synced?: number; error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Failed to connect'); return; }
      toast.success(`Catalog connected! ${data.synced ?? 0} products synced.`);
      setCatalogIdInput('');
      void queryClient.invalidateQueries({ queryKey: ['catalog', workspaceId] });
    } catch { toast.error('Network error'); }
    finally { setConnecting(false); }
  };

  const handleSync = async () => {
    if (!catalogId) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, catalogId }),
      });
      const data = await res.json() as { synced?: number; error?: string };
      if (!res.ok) { toast.error(data.error ?? 'Sync failed'); return; }
      toast.success(`Synced ${data.synced ?? 0} products from Meta.`);
      void queryClient.invalidateQueries({ queryKey: ['catalog', workspaceId] });
    } catch { toast.error('Network error'); }
    finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect catalog? All synced products will be removed.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/catalog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      toast.success('Catalog disconnected');
      void queryClient.invalidateQueries({ queryKey: ['catalog', workspaceId] });
    } catch { toast.error('Network error'); }
    finally { setDisconnecting(false); }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold">WhatsApp Catalog</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connect your Meta Commerce Catalog to send product cards directly in WhatsApp conversations.
        </p>
      </div>

      {/* Info callout */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 flex gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <p className="font-semibold">Before you connect</p>
          <p>Create a product catalog in <strong>Meta Commerce Manager</strong>, link it to your WhatsApp Business Account, and get the Catalog ID from the catalog settings.</p>
          <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 font-medium underline underline-offset-2">
            Open Meta Commerce Manager <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Connected state */}
      {catalogId ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-800">Catalog Connected</p>
                <p className="text-xs text-green-600 font-mono">ID: {catalogId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void handleSync()}
                disabled={syncing}
              >
                <RefreshCw className={cn('h-3 w-3', syncing && 'animate-spin')} />
                {syncing ? 'Syncing…' : 'Sync Products'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
          <p className="text-xs text-green-700">{products.length} products synced</p>
        </div>
      ) : (
        /* Connect form */
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Connect Meta Catalog</p>
          <div className="flex gap-2">
            <Input
              placeholder="Meta Catalog ID (e.g. 123456789)"
              value={catalogIdInput}
              onChange={(e) => setCatalogIdInput(e.target.value)}
              className="h-9 text-sm font-mono"
            />
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-brand-500 hover:bg-brand-600 shrink-0"
              onClick={() => void handleConnect()}
              disabled={connecting}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              {connecting ? 'Connecting…' : 'Connect & Sync'}
            </Button>
          </div>
        </div>
      )}

      {/* Products grid */}
      {products.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{products.length} Products</h3>
            <Badge variant="outline" className="text-xs">{products.filter(p => p.availability === 'in stock').length} in stock</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
              >
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-32 object-cover bg-muted"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-32 bg-muted flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="p-2.5 space-y-1">
                  <p className="text-xs font-semibold truncate">{product.name}</p>
                  {product.price && (
                    <p className="text-xs font-bold text-brand-600">
                      {product.currency ?? ''} {product.price}
                    </p>
                  )}
                  <p className="text-[10px] font-mono text-muted-foreground truncate">{product.retailer_id}</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] px-1.5 py-0 h-4',
                      product.availability === 'in stock'
                        ? 'border-green-200 text-green-700 bg-green-50'
                        : 'border-red-200 text-red-700 bg-red-50',
                    )}
                  >
                    {product.availability ?? 'unknown'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {catalogId && products.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No products synced yet</p>
          <p className="text-xs mt-1">Click "Sync Products" to fetch products from Meta.</p>
        </div>
      )}
    </div>
  );
}
