// /sw.js
const STATIC_CACHE = 'static-v1';
const API_CACHE = 'api-v1';
const STATIC_ASSETS = [
  '/', 
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/src/js/main.js',
  '/src/js/lazyload.js',
  '/src/js/cachedFetch.js'
  // Añade aquí otros assets críticos: fuentes, logo, etc.
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
      keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Estrategia para APIs: stale-while-revalidate
  if (url.pathname.startsWith('/api/') || url.hostname.includes('api.')) {
    event.respondWith(
      caches.open(API_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req).then(networkRes => {
          if (networkRes && networkRes.ok) cache.put(req, networkRes.clone());
          return networkRes;
        }).catch(() => null);
        // devuelve cached si existe, si no espera la red
        return cached || networkFetch || new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' }});
      })
    );
    return;
  }

  // 2) Static assets: cache-first, fallback offline page
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(networkRes => {
        // opcional: cachear nuevas respuestas
        return networkRes;
      }).catch(() => {
        // fallback a offline para documentos navegables
        if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
          return caches.match('/offline.html');
        }
        return new Response(null, { status: 504, statusText: 'offline' });
      });
    })
  );
});
