// CasinoGhost offline cache. Pages load network-first (so updates arrive), everything else
// cache-first. On install, the app shell and the assets index.html references are cached.
const CACHE = 'casinoghost-v3';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch('./', { cache: 'no-cache' });
    const html = await res.clone().text();
    await cache.put('./', res);
    const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((m) => m[1]);
    await cache.addAll([...new Set(assets)]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // The app shell is cached as './'; other pages (privacy, support) under their own URL.
    const scope = new URL(self.registration.scope).pathname;
    const isShell = url.pathname === scope || url.pathname === `${scope}index.html`;
    const key = isShell ? './' : url.pathname;
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(key, res.clone());
        return res;
      } catch {
        return (await caches.match(key)) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});
