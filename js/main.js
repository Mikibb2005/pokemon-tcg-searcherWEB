// js/main.js (ES module)
import { debounce } from './utils.js';
import { fetchCardsByQuery, fetchSets, LANGUAGES } from './api.js';
import { getImage, setImage } from './cache.js';
import { LoadingState } from './state.js';

// Elementos DOM
const searchName = document.getElementById('searchName');
const expansionSelect = document.getElementById('expansionSelect');
const raritySelect = document.getElementById('raritySelect');
const cardNumber = document.getElementById('cardNumber');
const cardsGrid = document.getElementById('cardsGrid');
const buscarBtn = document.getElementById('buscarBtn');
const clearBtn = document.getElementById('clearBtn');

let currentPage = 1;
let totalPages = 0;

const OWNED_KEY = 'ptcg_owned';

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function populateSets() {
    if (!expansionSelect) return;

    expansionSelect.innerHTML = '<option value="">Cargando expansiones...</option>';

    try {
        // 1) Intentar usar la función principal
        let sets = [];
        try {
            sets = await fetchSets();
        } catch (innerErr) {
            console.warn('fetchSets() falló, intentando fallback directo:', innerErr);
            sets = [];
        }

        // 2) Si no hay resultados, intentar endpoint directo como fallback
        if (!Array.isArray(sets) || sets.length === 0) {
            try {
                const resp = await fetch('https://api.tcgdex.net/v2/en/sets');
                if (resp.ok) {
                    const json = await resp.json();
                    // json puede ser un array o un objeto con .sets o .data
                    if (Array.isArray(json)) {
                        sets = json;
                    } else if (Array.isArray(json.sets)) {
                        sets = json.sets;
                    } else if (Array.isArray(json.data)) {
                        sets = json.data;
                    } else {
                        // si la estructura es inesperada, dejar vacío y continuar
                        console.warn('Estructura inesperada en /en/sets:', json);
                        sets = [];
                    }
                } else {
                    console.warn('Fallback /en/sets respondió con status', resp.status);
                }
            } catch (err) {
                console.warn('Error en fallback directo a /en/sets:', err);
                sets = [];
            }
        }

        if (!Array.isArray(sets) || sets.length === 0) {
            throw new Error('No se encontraron expansiones (respuesta vacía)');
        }

        // 3) Normalizar campos (soporta varias formas que pueda devolver la API)
        const normalizedSets = sets.map(s => {
            return {
                id: s.id || s.code || s.setId || s.set_id || '',
                name: s.name || s.title || s.fullName || s.setName || 'Sin nombre',
                series: s.series || s.serie || s.seriesName || s.setSeries || s.series_name || 'Otras',
                cardCount: {
                    total: s.cardCount?.total || s.cardCount?.official || s.cardCount || s.totalCards || s.total_cards || 0,
                    official: s.cardCount?.official || s.cardCount || 0
                },
                logo: s.logo || null,
                symbol: s.symbol || null,
                releaseDate: s.releaseDate || s.releasedAt || s.release_date || s.release || null
            };
        });

        // Agrupar por series (manteniendo orden estable)
        const seriesGroups = normalizedSets.reduce((groups, set) => {
            const serie = set.series || 'Otras';
            if (!groups[serie]) groups[serie] = [];
            groups[serie].push(set);
            return groups;
        }, {});

        // Ordenar series por fecha del set más reciente dentro de cada grupo
        const optionsHtml = Object.entries(seriesGroups)
            .sort(([serieA, setsA], [serieB, setsB]) => {
                // calcular la fecha más reciente en cada grupo (si existe)
                const latestA = setsA.map(x => x.releaseDate ? new Date(x.releaseDate).getTime() : 0).reduce((a,b)=>Math.max(a,b), 0);
                const latestB = setsB.map(x => x.releaseDate ? new Date(x.releaseDate).getTime() : 0).reduce((a,b)=>Math.max(a,b), 0);
                return latestB - latestA;
            })
            .map(([serie, serieSets]) => `
                <optgroup label="${escapeHtml(serie)}">
                    ${serieSets
                        .sort((a,b) => (new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0)))
                        .map(set => `
                            <option value="${escapeHtml(set.id)}">
                                ${escapeHtml(set.name)} 
                                ${set.releaseDate ? `(${new Date(set.releaseDate).toLocaleDateString('es-ES', { year:'numeric', month:'short' })})` : ''}
                                - ${Number(set.cardCount?.total || 0)} cartas
                            </option>
                        `).join('')}
                </optgroup>
            `).join('');

        expansionSelect.innerHTML = `
            <option value="">Cualquier expansión</option>
            ${optionsHtml}
        `;
    } catch (err) {
        console.error('Error cargando expansiones (populateSets):', err);
        expansionSelect.innerHTML = `<option value="">Error cargando expansiones</option>`;
    }
}


function readFilters() {
  const name = searchName ? searchName.value.trim() : '';
  const number = cardNumber ? cardNumber.value.trim() : '';
  const setId = expansionSelect ? expansionSelect.value : '';
  const rarity = raritySelect ? raritySelect.value : '';
  const rarities = rarity ? [rarity] : [];
  return { name, number, setId, rarities };
}

async function searchCards(params = {}) {
    try {
        cardsGrid.innerHTML = '<div class="loading">Buscando cartas...</div>';

        const filters = {
            name: searchName?.value?.trim(),
            setId: expansionSelect?.value,
            number: cardNumber?.value?.trim(),
            rarities: raritySelect?.value ? [raritySelect.value] : [],
            page: params.page || currentPage,
            pageSize: 50
        };

        console.log('Buscando con filtros:', filters);
        const response = await fetchCardsByQuery(filters);

        if (!response || !response.cards) throw new Error('Respuesta inválida de la API');

        currentPage = response.page;
        totalPages = response.totalPages;

        if (response.cards.length > 0) {
            renderResults(response.cards);
            renderPagination();
        } else {
            cardsGrid.innerHTML = '<div class="no-results">No se encontraron cartas</div>';
        }
    } catch (error) {
        console.error('Error en búsqueda:', error);
        cardsGrid.innerHTML = `<div class="error-message">Error: ${escapeHtml(error.message)}</div>`;
    }
}

async function loadCardImage(imgElement, url) {
    if (!url) {
        imgElement.src = 'css/pokeball.svg';
        return;
    }
    try {
        imgElement.src = url;
        imgElement.onerror = () => { imgElement.src = 'css/pokeball.svg'; };
    } catch (error) {
        console.warn('Error cargando imagen:', url, error);
        imgElement.src = 'css/pokeball.svg';
    }
}

function renderResults(cards) {
    if (!cards?.length) {
        cardsGrid.innerHTML = '<div class="no-results">No se encontraron cartas</div>';
        return;
    }
    const fragment = document.createDocumentFragment();
    cards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        cardEl.innerHTML = `
            <div class="thumb">
                <img 
                    alt="${escapeHtml(card.name)}"
                    src="${card.images?.small || 'css/pokeball.svg'}"
                    onerror="this.src='css/pokeball.svg'"
                >
            </div>
            <div class="info">
                <h3>${escapeHtml(card.name)}</h3>
                <div class="meta">
                    ${escapeHtml(card.set?.name || '')}
                    ${card.number ? ` • #${escapeHtml(card.number)}` : ''}
                </div>
            </div>
        `;
        cardEl.addEventListener('click', () => openModal(card));
        fragment.appendChild(cardEl);
    });
    cardsGrid.innerHTML = '';
    cardsGrid.appendChild(fragment);
}

function renderPagination() {
    const paginationContainer = document.querySelector('.pagination') || document.createElement('div');
    paginationContainer.className = 'pagination';
    if (totalPages <= 1) {
        paginationContainer.remove();
        return;
    }
    paginationContainer.innerHTML = `
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(1)" title="Primera página">«</button>
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})" title="Página anterior">‹</button>
        <span> Página ${currentPage} de ${totalPages} <small>(50 cartas por página)</small></span>
        <button ${currentPage >= totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})" title="Página siguiente">›</button>
        <button ${currentPage >= totalPages ? 'disabled' : ''} onclick="changePage(${totalPages})" title="Última página">»</button>
    `;
    if (!paginationContainer.parentElement) {
        cardsGrid.insertAdjacentElement('afterend', paginationContainer);
    }
}

window.changePage = async function(page) {
  currentPage = page;
  await searchCards({ page });
  window.scrollTo(0, 0);
};

// --- "Tengo" (localStorage) ---
function getOwnedList() {
    try { return JSON.parse(localStorage.getItem(OWNED_KEY) || '[]'); }
    catch { return []; }
}
function saveOwnedList(list) {
    localStorage.setItem(OWNED_KEY, JSON.stringify(Array.from(new Set(list))));
}
function isCardOwned(cardKey) {
    return getOwnedList().includes(cardKey);
}
function toggleCardOwned(cardKey) {
    const list = getOwnedList();
    const idx = list.indexOf(cardKey);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(cardKey);
    saveOwnedList(list);
    return isCardOwned(cardKey);
}
function updateOwnedButton(buttonEl, cardKey) {
    if (!buttonEl) return;
    const owned = isCardOwned(cardKey);
    buttonEl.textContent = owned ? '✓ Tengo' : 'Marcar como tengo';
    buttonEl.setAttribute('aria-pressed', owned ? 'true' : 'false');
    buttonEl.classList.toggle('owned', owned);
}

function getRarityClass(rarity) {
    if (!rarity) return '';
    const r = rarity.toLowerCase();
    if (r.includes('common')) return 'common';
    if (r.includes('uncommon')) return 'uncommon';
    if (r.includes('rare') && !r.includes('ultra') && !r.includes('secret')) return 'rare';
    if (r.includes('ultra rare')) return 'ultra-rare';
    if (r.includes('secret')) return 'secret-rare';
    return '';
}

// --- Modal: FOTO GRANDE PRIMERO + variantes + "Tengo" (SIN selector de idioma) ---
const modalCloseHandler = (event) => {
  if (event.key === 'Escape' || event.target.id === 'cardModal') closeModal();
};

async function openModal(card) {
    const modal = document.getElementById('cardModal');
    modal.innerHTML = `<div class="modal-content">Cargando...</div>`;
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // limpiar handlers previos si existen
    if (modal._handlers) {
        try {
            const { ownedBtn, ownedHandler } = modal._handlers;
            if (ownedBtn && ownedHandler) ownedBtn.removeEventListener('click', ownedHandler);
        } catch (e) { /* ignore */ }
    }
    modal._handlers = null;

    document.addEventListener('keydown', modalCloseHandler);
    modal.addEventListener('click', modalCloseHandler);

    const cardKey = `${card.set?.id || 'unknown'}#${card.number || card.localId || '0'}`;

    // Obtener datos "completos" de la carta en inglés (si está disponible)
    let fullCard = null;
    try {
        const resp = await fetch(`https://api.tcgdex.net/v2/en/sets/${card.set.id}/${card.number}`);
        if (resp.ok) fullCard = await resp.json();
    } catch (err) {
        console.warn('No se pudo cargar la carta completa (fallback):', err);
        fullCard = null;
    }

    // Normalizar imagen principal: prioridad fullCard.image -> card.images.large -> card.images.small -> fallback
    const mainImageUrl = fullCard?.image ? `${fullCard.image}/high.webp` : (card.images?.large || card.images?.small || 'css/pokeball.svg');

    // Extraer variantes/printings/editions de forma robusta
    function extractVariants(data) {
        if (!data) return [];
        const candidateArrays = [
            data.variants,
            data.variations,
            data.printings,
            data.editions,
            data.editionsList,
            data.sets
        ].filter(Boolean);
        const arr = candidateArrays.length ? candidateArrays.flat() : [];
        return arr.map((v, i) => {
            if (!v) return null;
            if (typeof v === 'string') {
                return { id: `v${i}`, name: v, info: '' };
            }
            return {
                id: v.id || v.code || v.printingId || `v${i}`,
                name: v.name || v.variantName || v.printing || v.setName || (`Variante ${i+1}`),
                info: v.note || v.info || v.details || (v.rarity ? `Rareza: ${v.rarity}` : ''),
                image: v.image ? (v.image.endsWith('/high.webp') ? v.image : `${v.image}/low.webp`) : (v.thumbnail || v.smallImage || null),
                raw: v
            };
        }).filter(Boolean);
    }

    const variants = extractVariants(fullCard || card) || [];

    // Construir el modal (imagen grande a la izquierda / arriba según pantalla). NO hay selector de idioma.
    modal.innerHTML = `
        <div class="modal-content" role="dialog" aria-modal="true" aria-label="Detalles de la carta">
            <button class="close-btn" onclick="closeModal()" aria-label="Cerrar">&times;</button>
            <div class="modal-body">
                <div class="modal-image" style="min-width:360px;max-width:520px;">
                    <img id="modalMainImage" src="${mainImageUrl}" alt="${escapeHtml(fullCard?.name || card.name)}" style="width:100%;height:auto;border-radius:10px;object-fit:contain" onerror="this.src='css/pokeball.svg'">
                </div>

                <div class="modal-info">
                    <div class="card-header" style="margin-bottom:0.6rem">
                        <h2 id="modalCardName">${escapeHtml(fullCard?.name || card.name)}</h2>
                        <span class="card-number" id="modalCardNum">#${escapeHtml(fullCard?.localId || card.number || '')}</span>
                    </div>

                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
                        <div style="flex:1;min-width:160px;"></div>
                        <div style="min-width:160px;">
                            <button id="ownedBtn" class="btn primary" aria-pressed="false">Marcar como tengo</button>
                        </div>
                    </div>

                    <div class="detail-section" id="modalDetailSection">
                        <h3>Información básica</h3>
                        <ul id="modalBasicInfo">
                            <li><strong>Set:</strong> ${escapeHtml(card.set.name)} ${card.set.series ? `(${escapeHtml(card.set.series)})` : ''}</li>
                            <li>
                                <strong>Rareza:</strong>
                                <span id="modalRarity" class="rarity-badge ${getRarityClass(fullCard?.rarity || card.rarity)}">
                                    ${escapeHtml(fullCard?.rarity || card.rarity || 'N/A')}
                                </span>
                            </li>
                            ${ (fullCard?.illustrator || card.illustrator) ? `
                                <li>
                                    <strong>Ilustrador:</strong>
                                    <span class="illustrator" id="modalIllustrator">${escapeHtml(fullCard?.illustrator || card.illustrator || '')}</span>
                                </li>
                            ` : '' }
                        </ul>
                    </div>

                    <div class="prices cardmarket" id="modalPrices" style="margin-top:0.75rem;">
                        <h3>Precios Cardmarket</h3>
                        <div id="modalPricesContent">Cargando precios (si están disponibles)...</div>
                    </div>

                    <div class="detail-section" id="modalVariantsSection" style="margin-top:1rem;">
                        <h3>Variantes / Printings</h3>
                        <div id="variantsContainer"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // DOM refs
    const modalMainImage = modal.querySelector('#modalMainImage');
    const ownedBtn = modal.querySelector('#ownedBtn');
    const modalNameEl = modal.querySelector('#modalCardName');
    const modalNumEl = modal.querySelector('#modalCardNum');
    const modalRarityEl = modal.querySelector('#modalRarity');
    const modalIllustratorEl = modal.querySelector('#modalIllustrator');
    const modalPricesContent = modal.querySelector('#modalPricesContent');
    const variantsContainer = modal.querySelector('#variantsContainer');

    // Inicializar botón "Tengo"
    updateOwnedButton(ownedBtn, cardKey);

    // Render variants area (miniaturas + detalle). Clicks en variantes NO cambian la foto principal.
    function renderVariantsList(variantsArr) {
        if (!variantsArr || !variantsArr.length) {
            variantsContainer.innerHTML = `<p class="small">No hay variantes registradas para esta carta.</p>`;
            return;
        }
        variantsContainer.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
                ${variantsArr.map((v, idx) => `
                    <div class="variant-item" data-vid="${escapeHtml(String(v.id||idx))}" style="background:#fff;padding:8px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);min-width:140px;cursor:pointer;display:flex;gap:8px;align-items:flex-start">
                        <div style="width:64px;height:90px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#f3f4f6;display:flex;align-items:center;justify-content:center">
                            ${v.image ? `<img src="${v.image}" alt="${escapeHtml(v.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.src='css/pokeball.svg'">` : `<div style="font-size:12px;color:#6b7280;padding:6px">Sin imagen</div>`}
                        </div>
                        <div style="flex:1">
                            <strong style="display:block">${escapeHtml(v.name || 'Variante')}</strong>
                            <div class="small mono">${escapeHtml(v.info || (v.raw && JSON.stringify(v.raw).slice(0,80)) || '')}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div id="variantDetail" style="margin-top:8px;background:#f8f9fa;padding:8px;border-radius:6px"></div>
        `;
        // attach click handlers
        variantsContainer.querySelectorAll('.variant-item').forEach(item => {
            item.addEventListener('click', () => {
                const vid = item.getAttribute('data-vid');
                const v = variantsArr.find(x => String(x.id) === vid);
                const det = modal.querySelector('#variantDetail');
                if (!v) {
                    det.innerHTML = '<div class="small">Detalle no disponible</div>';
                    return;
                }
                det.innerHTML = `
                    <div style="display:flex;gap:10px;align-items:flex-start">
                        <div style="width:120px;height:160px;border-radius:8px;overflow:hidden;background:#fff;flex-shrink:0;display:flex;align-items:center;justify-content:center">
                            ${v.image ? `<img src="${v.image}" alt="${escapeHtml(v.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.src='css/pokeball.svg'">` : `<div class="small">Sin imagen</div>`}
                        </div>
                        <div style="flex:1">
                            <h4 style="margin:0 0 8px 0">${escapeHtml(v.name)}</h4>
                            <div class="small">${escapeHtml(v.info || 'Sin más información')}</div>
                            <pre class="small mono" style="margin-top:8px;white-space:pre-wrap">${escapeHtml(JSON.stringify(v.raw || {}, null, 2).slice(0,1000))}${(JSON.stringify(v.raw || {}, null, 2).length > 1000 ? '...' : '')}</pre>
                        </div>
                    </div>
                `;
                // IMPORTANTE: NO se cambia la imagen principal aquí (pedido del usuario).
            });
        });
    }

    renderVariantsList(variants);

    // Owned handler
    const ownedHandler = (e) => {
        const nowOwned = toggleCardOwned(cardKey);
        updateOwnedButton(ownedBtn, cardKey);
        try { ownedBtn.animate?.([{ transform:'scale(1.04)' }, { transform:'scale(1)' }], { duration:140 }); } catch(e){}
    };

    // attach and save handlers to allow cleanup on close
    if (ownedBtn) ownedBtn.addEventListener('click', ownedHandler);
    modal._handlers = { ownedBtn, ownedHandler };

    // Fill initial prices (from already fetched fullCard if present)
    try {
        const cardmarket = (fullCard && fullCard.cardmarket) || {};
        if (cardmarket.prices) {
            modalPricesContent.innerHTML = `
                <ul>
                    <li><strong>Low:</strong> ${cardmarket.prices.lowPrice ?? 'No disponible'} €</li>
                    <li><strong>Trend:</strong> ${cardmarket.prices.trendPrice ?? 'No disponible'} €</li>
                    <li><strong>Average:</strong> ${cardmarket.prices.avg1 ?? 'No disponible'} €</li>
                </ul>
            `;
        } else {
            modalPricesContent.textContent = 'No disponible';
        }
    } catch (err) {
        modalPricesContent.textContent = 'No disponible';
    }
}

function closeModal() {
    const modal = document.getElementById('cardModal');
    if (modal) {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        document.removeEventListener('keydown', modalCloseHandler);
        modal.removeEventListener('click', modalCloseHandler);

        // cleanup modal handlers
        try {
            if (modal._handlers) {
                const { ownedBtn, ownedHandler } = modal._handlers;
                if (ownedBtn && ownedHandler) ownedBtn.removeEventListener('click', ownedHandler);
            }
        } catch (err) {
            console.warn('Error limpiando handlers del modal:', err);
        }
        modal._handlers = null;
        setTimeout(() => modal.innerHTML = '', 260);
    }
}
window.closeModal = closeModal;


// Noticias (sin cambios mayoritarios)
async function fetchNewsRSS(rssUrl) {
    const apiKey = 'd7rroqjnxsamqftlixqkifk2doywqetrqadpoewx';
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&api_key=${apiKey}`;
    try {
        const resp = await fetch(apiUrl);
        const data = await resp.json();
        return data.items || [];
    } catch (err) {
        console.warn('Error cargando noticias:', err);
        return [];
    }
}

async function renderNewsSidebar() {
    const newsList = document.getElementById('newsList');
    if (!newsList) return;
    newsList.innerHTML = '<div class="news-item">Cargando noticias...</div>';

    const sources = [
        { name: "JustinBasil", url: "https://www.pokebeach.com/feed" },
        { name: "Pokémon Oficial", url: "https://www.pokeguardian.com/rss" }
    ];

    let allNews = [];
    for (const src of sources) {
        const items = await fetchNewsRSS(src.url);
        const latest = items.sort((a,b)=> new Date(b.pubDate)-new Date(a.pubDate)).slice(0,2)
            .map(item=>({ title:item.title, link:item.link, date:item.pubDate, source:src.name, description:item.description }));
        allNews = allNews.concat(latest);
    }
    allNews.sort((a,b)=> new Date(b.date)-new Date(a.date));
    newsList.innerHTML = allNews.length ? allNews.map(news => `
        <article class="news-item">
            <h3>${news.title}</h3>
            <p>${news.description.replace(/<[^>]+>/g, '').slice(0, 120)}...</p>
            <small>${news.source} · ${new Date(news.date).toLocaleDateString()}</small><br>
            <a href="${news.link}" target="_blank" rel="noopener">Leer más</a>
        </article>
    `).join('') : '<div class="news-item">No hay noticias recientes.</div>';
}

// Listeners
function setupEventListeners() {
    searchName?.addEventListener('input', debounce(()=>{ currentPage=1; searchCards(); }, 300));
    searchName?.addEventListener('keypress', (e)=>{ if (e.key==='Enter'){ currentPage=1; searchCards(); }});
    buscarBtn?.addEventListener('click', ()=>{ currentPage=1; searchCards(); });
    expansionSelect?.addEventListener('change', ()=>{ currentPage=1; if (expansionSelect.value && !searchName.value.trim()) searchCards(); });

    const pageSizeSelect = document.createElement('select');
    pageSizeSelect.innerHTML = `
        <option value="20">20 cartas/página</option>
        <option value="50" selected>50 cartas/página</option>
        <option value="100">100 cartas/página</option>
    `;
    pageSizeSelect.addEventListener('change', ()=>{ currentPage=1; searchCards(); });
}

document.addEventListener('DOMContentLoaded', () => {
    populateSets();
    setupEventListeners();
    renderNewsSidebar();
});
