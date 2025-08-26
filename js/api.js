// /js/api.js
// API helper: paginación, cached fetch (stale-while-revalidate), manejo básico de errores
const DEFAULT_API_BASE = 'https://api.pokemontcg.io/v2'; // ajusta si usas otra

async function cachedFetchJSON(url, cacheName = 'api-cache') {
  // Si no hay Cache API -> fetch directo
  if (!('caches' in window)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Network error ${r.status}`);
    return r.json();
  }

  const cache = await caches.open(cacheName);
  const cachedResp = await cache.match(url);
  if (cachedResp) {
    // Devuelve ya cache y actualiza en background
    const data = await cachedResp.json();
    fetch(url).then(async net => {
      if (net && net.ok) await cache.put(url, net.clone());
    }).catch(()=>{ /* ignore */ });
    return data;
  }

  const networkResp = await fetch(url);
  if (networkResp && networkResp.ok) {
    await cache.put(url, networkResp.clone());
    return networkResp.json();
  }
  throw new Error('Network error and no cache available');
}

// get expansions list (pide solo lista, no todas las cartas)
export async function getExpansions() {
  // Endpoint de ejemplo; cambia según la API que estés usando
  const url = `${DEFAULT_API_BASE}/sets`;
  return cachedFetchJSON(url);
}

// obtener cartas por set/expansion con paginación
// page empieza en 1, pageSize default 20
export async function getCardsByExpansion(setId, page = 1, pageSize = 20) {
  // construye query: ajusta los parámetros a tu API
  const params = new URLSearchParams({
    q: `set.id:${setId}`,
    orderBy: 'number',
    page: String(page),
    pageSize: String(pageSize)
  });
  const url = `${DEFAULT_API_BASE}/cards?${params.toString()}`;
  return cachedFetchJSON(url);
}

// búsqueda con debounce (simple)
let _searchTimeout = null;
export function searchCardsDebounced(query, cb, wait = 350) {
  if (_searchTimeout) clearTimeout(_searchTimeout);
  _searchTimeout = setTimeout(async () => {
    try {
      const params = new URLSearchParams({
        q: query,
        page: '1',
        pageSize: '30'
      });
      const url = `${DEFAULT_API_BASE}/cards?${params.toString()}`;
      const data = await cachedFetchJSON(url);
      cb(null, data);
    } catch (err) {
      cb(err);
    }
  }, wait);
}
