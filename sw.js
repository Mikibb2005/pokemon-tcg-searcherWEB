// sw.js - service worker
const SW_VERSION = 'ptcg-sw-v1';
const PRECACHE_URLS = [ '/', '/index.html', '/offline.html' ];
const RUNTIME_IMAGE_CACHE = 'ptcg-images-v1';
const RUNTIME_API_CACHE = 'ptcg-api-v1';

self.addEventListener('install', evt => {
  evt.waitUntil((async ()=>{
    const cache = await caches.open(SW_VERSION);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', evt => {
  evt.waitUntil((async ()=>{
    // cleanup old caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==SW_VERSION && k!==RUNTIME_IMAGE_CACHE && k!==RUNTIME_API_CACHE).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});

// Helpers
async function cacheFirst(request, cacheName, maxEntries=200){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if(cached) return cached;
  try{
    const resp = await fetch(request);
    if(resp && resp.ok) await cache.put(request, resp.clone());
    // optional: enforce maxEntries
    return resp;
  }catch(e){
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName, maxAgeMs=24*3600*1000){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchP = fetch(request).then(async resp=>{ if(resp && resp.ok) await cache.put(request, resp.clone()); return resp; }).catch(()=>null);
  return cached || await fetchP;
}

self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);
  // Images: cache-first
  if(url.pathname.match(/\.(png|jpg|jpeg|webp|gif)$/i) || url.hostname.includes('images.pokemontcg')){
    evt.respondWith((async ()=>{
      const r = await cacheFirst(evt.request, RUNTIME_IMAGE_CACHE);
      if(r) return r;
      return fetch(evt.request).catch(()=>caches.match('/offline.html'));
    })());
    return;
  }

  // API JSON endpoints (heuristic: /v2/cards or /cards or ?q=)
  if(url.pathname.includes('/v2/') || url.pathname.includes('/cards') || url.searchParams.get('q')){
    evt.respondWith(staleWhileRevalidate(evt.request, RUNTIME_API_CACHE));
    return;
  }

  // default: network-first for HTML pages, fallback to cache
  if(evt.request.mode === 'navigate'){
    evt.respondWith((async ()=>{
      try{ return await fetch(evt.request); }
      catch(e){ return caches.match(evt.request) || caches.match('/offline.html'); }
    })());
    return;
  }

  // otherwise let browser handle
});
