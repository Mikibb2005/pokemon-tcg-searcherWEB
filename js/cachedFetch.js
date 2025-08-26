// /src/js/cachedFetch.js
export async function cachedFetchJSON(url, cacheName = 'api-cache') {
  if (!('caches' in window)) {
    // Si no hay Cache API, hacemos fetch normal
    const r = await fetch(url);
    if (!r.ok) throw new Error('Network error');
    return r.json();
  }

  const cache = await caches.open(cacheName);
  const cachedResp = await cache.match(url);
  if (cachedResp) {
    // Devuelve la versión cacheada inmediatamente
    const data = await cachedResp.json();

    // Revalidate en background
    fetch(url).then(async networkRes => {
      if (networkRes && networkRes.ok) {
        await cache.put(url, networkRes.clone());
      }
    }).catch(()=> { /* ignore network errors */ });

    return data;
  }

  // No cache -> fetch y cachea
  const networkResp = await fetch(url);
  if (networkResp && networkResp.ok) {
    cache.put(url, networkResp.clone());
    return networkResp.json();
  }
  throw new Error('Network error and no cache available');
}
