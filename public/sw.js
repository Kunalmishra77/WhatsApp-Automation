// AGENTiX service worker — minimal, network-first. Its purpose is to make the
// app installable (a fetch handler is required) and to serve a graceful offline
// fallback for navigations. It intentionally does NOT cache API responses or
// app assets aggressively, to avoid ever serving stale data.

const OFFLINE_CACHE = 'agentix-offline-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Only handle top-level navigations: try network, fall back to a cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // keep the latest successful navigation as the offline shell
          const copy = res.clone();
          caches.open(OFFLINE_CACHE).then((c) => c.put('offline-shell', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.open(OFFLINE_CACHE).then((c) => c.match('offline-shell')).then((r) => r || Response.error())),
    );
  }
  // Everything else uses the default network behaviour (no respondWith).
});
