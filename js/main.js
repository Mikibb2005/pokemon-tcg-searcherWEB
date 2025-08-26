// js/main.js (ES module)
import { fetchSets, fetchCardsByQuery } from './api.js';

// Helper DOM
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const expansionSelect = $('#expansionSelect');
const raritySelect = $('#raritySelect');
const variantFilter = $('#variantFilter');
const searchName = $('#searchName');
const cardNumber = $('#cardNumber');
const sortSelect = $('#sortSelect') || $('#sortSelect') || $('#sortSelect');
const sortOrder = $('#sortOrder');
const buscarBtn = $('#buscarBtn');
const filtrarBtn = $('#filtrarBtn');
const clearBtn = $('#clearBtn');
const cardsGrid = $('#cardsGrid');

function escapeHtml(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function populateSets() {
  if (!expansionSelect) return;
  expansionSelect.innerHTML = '<option value="">Cargando expansiones...</option>';
  try {
    const sets = await fetchSets();
    sets.sort((a,b)=> {
      if (a.releaseDate && b.releaseDate) return new Date(b.releaseDate) - new Date(a.releaseDate);
      return (a.name || '').localeCompare(b.name || '');
    });
    expansionSelect.innerHTML = '<option value="">Cualquier expansión</option>';
    sets.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id || s.code || s.name;
      opt.textContent = s.name + (s.releaseDate ? ` (${s.releaseDate.slice(0,4)})` : '');
      expansionSelect.appendChild(opt);
    });
  } catch (err) {
    expansionSelect.innerHTML = '<option value="">(error cargando expansiones)</option>';
    console.error('populateSets error', err);
  }
}

function readFilters() {
  const name = searchName ? searchName.value.trim() : '';
  const number = cardNumber ? cardNumber.value.trim() : '';
  const setId = expansionSelect ? expansionSelect.value : '';
  const rarity = raritySelect ? raritySelect.value : '';
  const rarities = rarity ? [rarity] : [];
  const variant = variantFilter ? variantFilter.value : 'all';
  const sortBy = sortSelect ? sortSelect.value : 'none';
  const order = sortOrder ? sortOrder.value : 'desc';
  return { name, number, setId, rarities, variant, sortBy, order };
}

function applyClientVariantFilter(cards, variant) {
  if (!variant || variant === 'all') return cards;
  if (variant === 'holo') {
    return cards.filter(c => (c.rarity || '').toLowerCase().includes('holo') || (c.rarity || '').toLowerCase().includes('holographic') );
  }
  if (variant === 'tournament') {
    return cards.filter(c => (c.set?.series && /promo|tournament|special/i.test(c.set?.series)) || (c.set?.id && /promo/i.test(c.set?.id)) || (c.subtypes && c.subtypes.includes('Promo')));
  }
  return cards;
}

function applyClientSort(cards, sortBy, order) {
  if (!sortBy || sortBy === 'none') return cards;
  const dir = (order === 'asc') ? 1 : -1;
  const sorted = cards.slice();
  sorted.sort((a,b) => {
    if (sortBy === 'name') {
      return dir * ((a.name||'').localeCompare(b.name||''));
    }
    if (sortBy === 'number') {
      const an = parseInt((a.number||'').replace(/[^0-9]/g,'')) || 0;
      const bn = parseInt((b.number||'').replace(/[^0-9]/g,'')) || 0;
      if (an !== bn) return dir * (an - bn);
      return dir * ((a.number||'').localeCompare(b.number||''));
    }
    if (sortBy === 'price') {
      const ap = (a.tcgplayer && a.tcgplayer?.prices && a.tcgplayer.prices.normal && a.tcgplayer.prices.normal.market) || (a.cardmarket && a.cardmarket?.prices && a.cardmarket.prices.averageSellPrice) || 0;
      const bp = (b.tcgplayer && b.tcgplayer?.prices && b.tcgplayer.prices.normal && b.tcgplayer.prices.normal.market) || (b.cardmarket && b.cardmarket?.prices && b.cardmarket.prices.averageSellPrice) || 0;
      return dir * ( (ap || 0) - (bp || 0) );
    }
    return 0;
  });
  return sorted;
}

function renderCards(cards) {
  if (!cardsGrid) {
    console.warn('No se encontró #cardsGrid para renderizar resultados.');
    return;
  }
  cardsGrid.innerHTML = '';
  if (!cards || !cards.length) {
    cardsGrid.innerHTML = '<p class="muted">No se han encontrado cartas.</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'card';
    const img = card.images?.small || card.images?.large || '';
    div.innerHTML = `
      <div class="thumb"><img src="${img}" alt="${escapeHtml(card.name)}" loading="lazy"></div>
      <div class="info">
        <div class="title">${escapeHtml(card.name)}</div>
        <div class="meta">${escapeHtml(card.set?.name || '')} • #${escapeHtml(card.number || '')} • ${escapeHtml(card.rarity || '')}</div>
      </div>
    `;
    frag.appendChild(div);
  });
  cardsGrid.appendChild(frag);
}

async function applyFilters() {
  const b = buscarBtn || filtrarBtn;
  if (b) b.disabled = true;
  try {
    const f = readFilters();
    const qparams = { name: f.name, setId: f.setId, rarities: f.rarities, number: f.number, pageSize: 250 };
    let cards = await fetchCardsByQuery(qparams);
    cards = applyClientVariantFilter(cards, f.variant);
    cards = applyClientSort(cards, f.sortBy, f.order);
    renderCards(cards);
  } catch (err) {
    console.error('applyFilters error', err);
    if (cardsGrid) cardsGrid.innerHTML = '<p class="muted">Error al buscar cartas.</p>';
  } finally {
    if (b) b.disabled = false;
  }
}

function clearFilters() {
  if (searchName) searchName.value = '';
  if (cardNumber) cardNumber.value = '';
  if (expansionSelect) expansionSelect.value = '';
  if (raritySelect) raritySelect.value = '';
  if (variantFilter) variantFilter.value = 'all';
  if (sortSelect) sortSelect.value = 'none';
  if (sortOrder) sortOrder.value = 'desc';
  if (cardsGrid) cardsGrid.innerHTML = '';
}

if (buscarBtn) buscarBtn.addEventListener('click', (e)=>{ e.preventDefault(); applyFilters(); });
if (filtrarBtn) filtrarBtn.addEventListener('click', (e)=>{ e.preventDefault(); applyFilters(); });
if (clearBtn) clearBtn.addEventListener('click', (e)=>{ e.preventDefault(); clearFilters(); });

document.addEventListener('submit', (ev)=>{ ev.preventDefault(); });

window.addEventListener('DOMContentLoaded', () => {
  populateSets();
});
