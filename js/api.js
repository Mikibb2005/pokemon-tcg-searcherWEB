/* js/api.js - Optimizado
 - PAGE_SIZE pequeño por defecto (12)
 - NO pide precios en búsquedas normales (reduce payload)
 - fetchPricesForIds(ids): solicita precios solo cuando se necesitan (single request)
 - fetchSetsFirstPage + fetchSetsAllBackground: muestra first page inmediatamente y completa en background
 - service worker + caches aceleran respuestas siguientes
 - cache en memoria + localStorage (TTL)
*/

const REMOTE_BASE = "https://api.pokemontcg.io/v2/cards";
const SETS_BASE = "https://api.pokemontcg.io/v2/sets";
const PAGE_SIZE = 12; // menos carga inicial
const SEARCH_CACHE_TTL = 1000 * 60 * 60;     // 1 hora
const SETS_CACHE_TTL = 1000 * 60 * 60 * 24;  // 24 horas
const RANDOM_CACHE_TTL = 1000 * 60 * 30;     // 30 minutos

const memCache = new Map(); // cache por sesión
const idCache = new Map();

function readPersistent(key){
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch(e){ return null; }
}
function writePersistent(key, obj){
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch(e){}
}

/* buildQuery */
function buildQuery(filters){
  const parts = [];
  if(filters.name){ const clean = filters.name.trim().replace(/"/g,''); if(clean) parts.push(`name:${clean}*`); }
  if(filters.set){ const s = filters.set.replace(/"/g,''); parts.push(`set.name:"${s}"`); }
  if(filters.number){ const n = String(filters.number).trim(); parts.push(`number:"${n}"`); }
  if(filters.rarity){ const r = filters.rarity.replace(/"/g,''); parts.push(`rarity:"${r}"`); }
  if(filters.variantFilter === "holo"){ parts.push(`rarity:("Holo" OR "Foil" OR "Holographic" OR "Rare Holo")`); }
  else if(filters.variantFilter === "tournament"){ parts.push(`(name:*promo* OR name:*tournament* OR rarity:*promo*)`); }
  return parts.length ? parts.join(" ") : "*";
}

/* fetchCards(filters, options)
   options.includePrices = false by default
*/
async function fetchCards(filters = {}, options = { includePrices: false }){
  const keyObj = {...filters, page:1, pageSize: PAGE_SIZE, includePrices: !!options.includePrices};
  const key = JSON.stringify(keyObj);

  if(memCache.has(key)) return memCache.get(key);

  const persist = readPersistent("ptcg_cache_search_" + key);
  if(persist && (Date.now() - persist.ts) < SEARCH_CACHE_TTL){
    memCache.set(key, persist.data);
    return persist.data;
  }

  const q = buildQuery(filters);
  // select ligero por defecto (NO precios)
  const baseSelect = ["id","name","number","rarity","set.name","images.small"].join(",");
  const select = options.includePrices ? baseSelect + ",tcgplayer,cardmarket" : baseSelect;

  const params = new URLSearchParams({ page:1, pageSize: PAGE_SIZE, select });
  if(q !== "*") params.set("q", q);

  const url = REMOTE_BASE + "?" + params.toString();
  const headers = {};
  if(window.PTCG_API_KEY) headers["X-Api-Key"] = window.PTCG_API_KEY;

  const resp = await fetch(url, { headers });
  if(!resp.ok){
    const txt = await resp.text().catch(()=>'');
    throw new Error(`Error API ${resp.status} - ${txt}`);
  }
  const json = await resp.json();
  const data = json.data || [];
  memCache.set(key, data);
  writePersistent("ptcg_cache_search_" + key, { ts: Date.now(), data });
  return data;
}

/* fetchPricesForIds(ids) - pide precios para varios ids en una sola llamada
   usa q=id:("id1" OR "id2" ...)
   devuelve un map id -> { priceNumber or null }
*/
async function fetchPricesForIds(ids = []){
  if(!ids || ids.length === 0) return {};
  // comprobar idCache parcial
  const map = {};
  const missed = [];
  ids.forEach(id => {
    if(idCache.has(id) && idCache.get(id).priceTs && (Date.now() - idCache.get(id).priceTs) < SEARCH_CACHE_TTL){
      map[id] = idCache.get(id).price;
    } else missed.push(id);
  });
  if(missed.length === 0) return map;

  // construir q por ids (lucene)
  const q = 'id:(' + missed.map(id => `"${id}"`).join(' OR ') + ')';
  const select = ['id','tcgplayer','cardmarket'].join(',');
  const params = new URLSearchParams({ q, page:1, pageSize: missed.length, select });
  const url = REMOTE_BASE + '?' + params.toString();
  const headers = {};
  if(window.PTCG_API_KEY) headers['X-Api-Key'] = window.PTCG_API_KEY;

  const resp = await fetch(url, { headers });
  if(!resp.ok){
    // fall back: dejar nulls
    missed.forEach(id => { map[id] = null; idCache.set(id, { price: null, priceTs: Date.now() }); });
    return map;
  }
  const json = await resp.json();
  const arr = json.data || [];
  // extraer precio preferido
  arr.forEach(c => {
    let price = null;
    try {
      if(c.tcgplayer && c.tcgplayer.prices){
        for(const k of Object.keys(c.tcgplayer.prices)){
          const p = c.tcgplayer.prices[k];
          if(p && typeof p.market === 'number'){ price = p.market; break; }
          if(p && typeof p.mid === 'number'){ price = p.mid; break; }
        }
      }
      if(price === null && c.cardmarket && c.cardmarket.prices){
        const cm = c.cardmarket.prices;
        if(typeof cm.averageSellPrice === 'number') price = cm.averageSellPrice;
      }
    } catch(e){}
    idCache.set(c.id, { price, priceTs: Date.now() });
    map[c.id] = price;
  });
  // ensure missed ids present
  missed.forEach(id => { if(!(id in map)){ map[id] = idCache.has(id) ? idCache.get(id).price : null; }});
  return map;
}

/* fetchRandomHighRarity(count) - igual que antes, pero con PAGE_SIZE moderado */
async function fetchRandomHighRarity(count = 10){
  const key = `ptcg_random_high_${count}`;
  const persist = readPersistent(key);
  if(persist && (Date.now() - persist.ts) < RANDOM_CACHE_TTL) return persist.data;

  const HIGH = ['Secret Rare','Ultra Rare','Rare Holo','Rare Rainbow','Rare'];
  const rarityClause = `rarity:(${HIGH.map(r=>`"${r}"`).join(' OR ')})`;
  const select = ["id","name","number","rarity","set.name","images.small"].join(',');
  const params = new URLSearchParams({ q: rarityClause, page:1, pageSize:250, select });
  const url = REMOTE_BASE + '?' + params.toString();
  const headers = {};
  if(window.PTCG_API_KEY) headers['X-Api-Key'] = window.PTCG_API_KEY;

  const resp = await fetch(url, { headers });
  if(!resp.ok) return [];
  const json = await resp.json();
  const pool = json.data || [];
  const picked = [];
  const used = new Set();
  const max = Math.min(count, pool.length);
  while(picked.length < max){
    const idx = Math.floor(Math.random() * pool.length);
    if(!used.has(idx)){ used.add(idx); picked.push(pool[idx]); }
  }
  writePersistent(key, { ts: Date.now(), data: picked });
  return picked;
}

/* --- Sets: show first page immediately + background fetch for full list --- */

/* fetchSetsFirstPage: obtiene la primera página (rápida) y devuelve array */
async function fetchSetsFirstPage(){
  // si hay cache persistente devuelvo todo de golpe
  const persist = readPersistent('ptcg_cache_sets');
  if(persist && (Date.now() - persist.ts) < SETS_CACHE_TTL) return persist.data;

  // sino, hacemos solo la primera página y devolvemos
  const params = new URLSearchParams({ page:1, pageSize:250, select: 'id,name' });
  const url = SETS_BASE + '?' + params.toString();
  const headers = {};
  if(window.PTCG_API_KEY) headers['X-Api-Key'] = window.PTCG_API_KEY;

  try {
    const resp = await fetch(url, { headers });
    if(!resp.ok) return [];
    const json = await resp.json();
    const data = json.data || [];
    return data;
  } catch(e){
    return [];
  }
}

/* fetchSetsAllBackground: descarga el resto en paralelo y actualiza localStorage; dispara evento 'ptcg:setsUpdated' */
async function fetchSetsAllBackground(){
  const persist = readPersistent('ptcg_cache_sets');
  if(persist && (Date.now() - persist.ts) < SETS_CACHE_TTL) return persist.data;

  const headers = {};
  if(window.PTCG_API_KEY) headers['X-Api-Key'] = window.PTCG_API_KEY;
  const pageSize = 250;
  let all = [];
  try {
    // primera página (ya la mostramos, pero la re-obtenemos para seguridad)
    const params1 = new URLSearchParams({ page:1, pageSize, select: 'id,name' });
    const url1 = SETS_BASE + '?' + params1.toString();
    const resp1 = await fetch(url1, { headers });
    if(!resp1.ok) { writePersistent('ptcg_cache_sets', { ts:Date.now(), data: [] }); return []; }
    const json1 = await resp1.json();
    const data1 = json1.data || [];
    all.push(...data1);
    if(data1.length >= pageSize){
      let page = 2;
      const CONC = 6;
      let keep = true;
      while(keep){
        const pages = [];
        for(let i=0;i<CONC;i++) pages.push(page + i);
        const promises = pages.map(p => {
          const ps = new URLSearchParams({ page: p, pageSize, select: 'id,name' });
          const url = SETS_BASE + '?' + ps.toString();
          return fetch(url, { headers }).then(r => r.ok ? r.json().then(j => j.data || []) : []).catch(()=>[]);
        });
        const results = await Promise.all(promises);
        let anySmall = false;
        results.forEach(arr => { if(arr.length > 0){ all.push(...arr); if(arr.length < pageSize) anySmall = true; } else anySmall = true; });
        if(anySmall) keep = false; else page += CONC;
      }
    }
  } catch(e){
    console.warn('fetchSetsAllBackground fallo', e);
  }

  // dedupe y ordenar
  const map = new Map();
  all.forEach(s => { const name = (s.name||s.id||'').trim(); if(name && !map.has(name)) map.set(name, s); });
  const arr = Array.from(map.values()).sort((a,b) => (a.name||'').localeCompare(b.name||''));
  writePersistent('ptcg_cache_sets',{ ts: Date.now(), data: arr });

  // notificar a clientes que sets se han actualizado
  try {
    selfDispatchEvent('ptcg:setsUpdated', arr);
  } catch(e){}
  return arr;
}

/* helper: dispatch de evento en window (si existe) */
function selfDispatchEvent(name, detail){
  try {
    if(typeof window !== 'undefined' && window && window.dispatchEvent){
      const ev = new CustomEvent(name, { detail });
      window.dispatchEvent(ev);
    }
  } catch(e){}
}

/* fetchCardById */
async function fetchCardById(id){
  if(!id) return null;
  if(idCache.has(id)) return idCache.get(id);
  const persist = readPersistent('ptcg_cardid_' + id);
  if(persist && (Date.now() - persist.ts) < SEARCH_CACHE_TTL){ idCache.set(id,persist.data); return persist.data; }

  const url = `${REMOTE_BASE}/${encodeURIComponent(id)}`;
  const headers = {};
  if(window.PTCG_API_KEY) headers['X-Api-Key'] = window.PTCG_API_KEY;
  try {
    const resp = await fetch(url, { headers });
    if(!resp.ok) return null;
    const json = await resp.json();
    const data = json.data || json;
    idCache.set(id, data);
    writePersistent('ptcg_cardid_' + id, { ts: Date.now(), data });
    return data;
  } catch(e){
    return null;
  }
}

/* export */
window.PTCG = {
  fetchCards,
  fetchPricesForIds,
  fetchRandomHighRarity,
  fetchSetsFirstPage,
  fetchSetsAllBackground,
  fetchCardById
};
