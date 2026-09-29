// Cache only public static resources. API responses, media and pages stay on the network.
const CACHE = 'webstorage-static-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('webstorage-static-') && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/(api|media|health)(\/|$)/.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, {cache: 'no-store'}).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Vite assets have content hashes. Never cache HTML or authenticated resources here.
  if (!url.pathname.startsWith('/assets/') ||
      !['script', 'style', 'font'].includes(request.destination)) return;

  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch {
      return fetch(request);
    }
    const response = await fetch(request);
    if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
      try {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        const assets = keys.filter((key) => new URL(key.url).pathname.startsWith('/assets/'));
        await Promise.all(assets.slice(0, Math.max(0, assets.length - 100)).map((key) => cache.delete(key)));
      } catch {
        // A full or disabled cache must not prevent the application from loading.
      }
    }
    return response;
  })());
});
