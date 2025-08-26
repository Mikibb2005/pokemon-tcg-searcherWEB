/* js/app.js - UI optimizado
 - muestra sets INMEDIATAMENTE si hay cache; si no, muestra first page instantly
 - empieza background fetch para completar sets y actualiza select cuando termine
 - no pide precios en búsquedas normales; sólo si se ordena por precio llamamos fetchPricesForIds
 - lazy images: se reutiliza imageObserver global si existe (o creamos uno)
*/

/* DOM */
const searchName = document.getElementById('searchName');
const buscarBtn = document.getElementById('buscarBtn');
const filtrarBtn = document.getElementById('filtrarBtn');
const clearBtn = document.getElementById('clearBtn');
const cardNumber = document.getElementById('cardNumber');
const expansionSelect = document.getElementById('expansionSelect');
const raritySelect = document.getElementById('raritySelect');
const variantFilter = document.getElementById('variantFilter');
const sortSelect = document.getElementById('sortSelect');
const sortOrder = document.getElementById('sortOrder');
const cardsGrid = document.getElementById('cardsGrid');

const cardModal = document.getElementById('cardModal');
const closeModal = document.getElementById('closeModal');
const modalImage = document.getElementById('modalImage');
const modalName = document.getElementById('modalName');
const modalSet = document.getElementById('modalSet');
const modalNumber = document.getElementById('modalNumber');
const modalRarity = document.getElementById('modalRarity');
const modalPrice = document.getElementById('modalPrice');
const modalRaw = document.getElementById('modalRaw');

let lastResults = [];
let imageObserver = window.imageObserver || null;
if(!imageObserver){
  imageObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        const img = entry.target;
        const real = img.dataset.src;
        if(real){ img.src = real; img.removeAttribute('data-src'); }
        obs.unobserve(img);
      }
    });
  }, { rootMargin: '80px', threshold: 0.1 });
  window.imageObserver = imageObserver;
}

/* helpers */
function setLoading(loading){
  if(loading) cardsGrid.innerHTML = "<p class='small'>Cargando...</p>";
}

/* 1) CARGAR expansiones de forma inmediata:
   - intentamos leer sets cache persistente (localStorage) y mostrarlos ya
   - si no hay cache -> pedimos FIRST PAGE y la mostramos (rápida)
   - siempre lanzamos background to fetch all; si llega, actualizamos select
*/
async function loadExpansionsImmediate(){
  // intentar cache persistente
  const persist = (function(){ try { const r = localStorage.getItem('ptcg_cache_sets'); return r ? JSON.parse(r).data || JSON.parse(r) : null; } catch(e){ return null; } })();
  if(persist && persist.length){
    populateExpansionSelect(persist);
    // igualmente actualizar en background si expirado
    window.PTCG.fetchSetsAllBackground().then(all => { if(all && all.length) populateExpansionSelect(all); }).catch(()=>{});
    return;
  }

  // no cache -> pedir first page y mostrar inmediatamente
  const first = await window.PTCG.fetchSetsFirstPage();
  if(first && first.length) populateExpansionSelect(first);
  // lanzar background para completar
  window.PTCG.fetchSetsAllBackground().then(all => { if(all && all.length) populateExpansionSelect(all); }).catch(()=>{});
}

function populateExpansionSelect(arr){
  // dedupe y ordenar por nombre
  const map = new Map();
  arr.forEach(s => { const name = (s.name||s.id||'').trim(); if(name && !map.has(name)) map.set(name, s); });
  const arr2 = Array.from(map.values()).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  // mantener la opción vacía arriba
  expansionSelect.innerHTML = '<option value="">Todas las expansiones</option>';
  arr2.forEach(s => {
    const opt = document.createElement('option'); opt.value = s.name || s.id || ""; opt.textContent = s.name || s.id || "";
    expansionSelect.appendChild(opt);
  });
}

/* PRICE helpers (uses api.fetchPricesForIds) */
function getCardPriceFromCache(card){
  try {
    if(card.tcgplayer && card.tcgplayer.prices){
      for(const k of Object.keys(card.tcgplayer.prices)){
        const p = card.tcgplayer.prices[k];
        if(p && typeof p.market === 'number') return p.market;
        if(p && typeof p.mid === 'number') return p.mid;
      }
    }
    if(card.cardmarket && card.cardmarket.prices){
      const cm = card.cardmarket.prices;
      if(typeof cm.averageSellPrice === 'number') return cm.averageSellPrice;
    }
  } catch(e){}
  return null;
}

/* sort helper (same as before, but will call fetchPricesForIds if sort by price) */
async function sortCardsIfNeeded(cards){
  const sortBy = sortSelect.value;
  const order = sortOrder.value;
  if(!sortBy || sortBy === 'none') return cards;

  if(sortBy === 'price'){
    // pedir precios para todos los resultados en un único request
    const ids = cards.map(c => c.id).filter(Boolean);
    const priceMap = await window.PTCG.fetchPricesForIds(ids);
    // aplicar precio a objetos (no mutamos originales, creamos shallow copy)
    const withPrice = cards.map(c => {
      const obj = {...c};
      obj.__price = (priceMap && priceMap[c.id] != null) ? priceMap[c.id] : getCardPriceFromCache(c);
      return obj;
    });
    // sort numeric
    withPrice.sort((a,b) => {
      const pa = a.__price, pb = b.__price;
      if(pa == null && pb == null) return 0;
      if(pa == null) return 1 * (order==='asc'?1:-1);
      if(pb == null) return -1 * (order==='asc'?1:-1);
      return (pa - pb) * (order==='asc'?1:-1);
    });
    return withPrice;
  } else {
    // name or number
    const copy = cards.slice();
    if(sortBy === 'name') copy.sort((a,b) => ((a.name||'').localeCompare(b.name||'')) * (order==='asc'?1:-1));
    else if(sortBy === 'number') copy.sort((a,b) => {
      const an = parseInt(a.number,10), bn = parseInt(b.number,10);
      if(!isNaN(an) && !isNaN(bn)) return (an - bn) * (order==='asc'?1:-1);
      return ((a.number||'').localeCompare(b.number||'')) * (order==='asc'?1:-1);
    });
    return copy;
  }
}

/* renderCards: pinta y aplica lazy images */
async function renderCards(cards){
  lastResults = cards || [];
  const toRender = await sortCardsIfNeeded(cards || []);
  cardsGrid.innerHTML = "";
  if(!toRender || toRender.length === 0){ cardsGrid.innerHTML = "<p class='small'>No hay resultados.</p>"; return; }

  toRender.forEach(card => {
    const el = document.createElement('article'); el.className = "card";
    el.addEventListener('click', () => openCardModal(card));
    const thumb = document.createElement('div'); thumb.className = "thumb";
    const img = document.createElement('img'); img.alt = card.name || ''; img.width = 90; img.height = 130; img.loading = 'lazy'; img.decoding = 'async';
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='90' height='130'><rect width='100%' height='100%' fill='#eee'/></svg>`);
    if(card.images && (card.images.small || card.images.large)){ img.dataset.src = card.images.small || card.images.large; imageObserver.observe(img); }
    thumb.appendChild(img);

    const meta = document.createElement('div'); meta.className = "meta";
    const title = document.createElement('strong'); title.textContent = card.name + ' ';
    const idspan = document.createElement('span'); idspan.className = 'small'; idspan.textContent = '(' + (card.number || '-') + ')';
    title.appendChild(idspan);
    const setName = (card.set && card.set.name) ? card.set.name : '-';
    const price = getCardPriceFromCache(card);
    const info = document.createElement('div'); info.className = 'variants';
    info.innerHTML = `<div><strong>Expansión:</strong> ${setName}</div><div class="small"><strong>Rareza:</strong> ${card.rarity || '-'} · <strong>Precio:</strong> ${price != null ? price.toFixed(2) : '-'}</div>`;

    meta.appendChild(title); meta.appendChild(info);
    el.appendChild(thumb); el.appendChild(meta);
    cardsGrid.appendChild(el);
  });
}

/* modal: intenta usar datos grandes si falta imagen grande */
async function openCardModal(card){
  let full = card;
  if(!card.images || !card.images.large){
    const fetched = await window.PTCG.fetchCardById(card.id);
    if(fetched) full = fetched;
  }
  modalImage.src = full.images?.large || full.images?.small || '';
  modalName.textContent = full.name || '';
  modalSet.textContent = 'Expansión: ' + (full.set?.name || '-');
  modalNumber.textContent = 'Número: ' + (full.number || '-');
  modalRarity.textContent = 'Rareza: ' + (full.rarity || '-');
  const price = getCardPriceFromCache(full);
  modalPrice.textContent = 'Precio (mejor): ' + (price != null ? price.toFixed(2) : '-');
  modalRaw.textContent = JSON.stringify(full, null, 2);
  cardModal.setAttribute('aria-hidden','false');
}
function closeCardModal(){ cardModal.setAttribute('aria-hidden','true'); modalImage.src = ''; }

/* BUSCAR (solo nombre) */
buscarBtn.addEventListener('click', async () => {
  const name = searchName.value.trim();
  setLoading(true);
  try {
    if(!name){
      const cards = await window.PTCG.fetchRandomHighRarity(10);
      await renderCards(cards);
    } else {
      const cards = await window.PTCG.fetchCards({ name }, { includePrices: false });
      await renderCards(cards);
    }
  } catch(e){
    cardsGrid.innerHTML = "<p class='small'>Error: " + e.message + "</p>";
  }
});

/* APLICAR FILTROS (todos los controles) */
filtrarBtn.addEventListener('click', async () => {
  const name = searchName.value.trim() || undefined;
  const num = cardNumber.value.trim() || undefined;
  const set = expansionSelect.value || undefined;
  const rarity = raritySelect.value || undefined;
  const variant = variantFilter.value || 'all';
  const noFilters = !name && !num && !rarity && (!set || set === '');

  setLoading(true);
  try {
    if(noFilters){
      const cards = await window.PTCG.fetchRandomHighRarity(10);
      await renderCards(cards);
    } else {
      // si se va a ordenar por precio pedimos includePrices=false ahora y fetchPricesForIds después en sortCardsIfNeeded
      const cards = await window.PTCG.fetchCards({ name, set, number: num, rarity, variantFilter: variant }, { includePrices: false });
      await renderCards(cards);
    }
  } catch(e){
    cardsGrid.innerHTML = "<p class='small'>Error: " + e.message + "</p>";
  }
});

/* limpiar */
clearBtn.addEventListener('click', () => {
  searchName.value = ''; cardNumber.value = ''; expansionSelect.value = ''; raritySelect.value = ''; variantFilter.value = 'all';
  sortSelect.value = 'none'; sortOrder.value = 'desc';
});

/* modal events */
closeModal.addEventListener('click', closeCardModal);
cardModal.addEventListener('click', e => { if(e.target === cardModal) closeCardModal(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeCardModal(); });

/* iniciar carga de expansiones de forma inmediata al cargar la página */
loadExpansionsImmediate();

/* actualizar select si background fetch terminó (escuchar evento global) */
window.addEventListener('ptcg:setsUpdated', (ev) => {
  try { populateExpansionSelect(ev.detail || []); } catch(e){}
});
