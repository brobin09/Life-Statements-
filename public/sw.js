// Offline support: cache the app shell on install, then serve from cache and refresh in the background.
const CACHE = 'life-statements-v2';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch('./', { cache: 'reload' });
    const html = await res.clone().text();
    await cache.put('./', res);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
      .filter((u) => !u.startsWith('http') && !u.startsWith('data:'));
    await cache.addAll([...new Set(assets)].map((u) => new URL(u, self.registration.scope).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true }) ?? (req.mode === 'navigate' ? await cache.match('./', { ignoreVary: true }) : undefined);
    const refresh = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => undefined);
    return hit ?? (await refresh) ?? new Response('Offline', { status: 503 });
  })());
});
