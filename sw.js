// /sw.js
const STATIC_CACHE = 'static-v2';
const API_CACHE = 'api-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/lists.html',
  '/offline.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/lazyload.js',
  '/js/main.js'
  // añade aquí tus rutas reales (fuentes, imágenes críticas)
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // API: stale-while-revalidate
  if (url.pathname.startsWith('/api/') || url.hostname.includes('api.pokemontcg.io')) {
    event.respondWith(
      caches.open(API_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req).then(networkRes => {
          if (networkRes && networkRes.ok) cache.put(req, networkRes.clone());
          return networkRes;
        }).catch(() => null);
        return cached || networkFetch || new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' }});
      })
    );
    return;
  }

  // Static assets: cache-first with network fallback
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      // optional: cache new static assets if needed
      return res;
    })).catch(() => {
      if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        return caches.match('/offline.html');
      }
      return new Response(null, { status: 504, statusText: 'offline' });
    })
  );
});
