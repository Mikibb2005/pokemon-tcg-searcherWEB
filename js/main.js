// js/main.js (ES module)
import { debounce } from './utils.js';
import { fetchCardsByQuery, fetchSets } from './api.js';
import { getImage, setImage } from './cache.js';
import { LoadingState } from './state.js'; // Añadir esta importación

// Elementos DOM
const searchName = document.getElementById('searchName');
const expansionSelect = document.getElementById('expansionSelect');
const raritySelect = document.getElementById('raritySelect');
const cardNumber = document.getElementById('cardNumber');
const cardsGrid = document.getElementById('cardsGrid');
const buscarBtn = document.getElementById('buscarBtn');
const clearBtn = document.getElementById('clearBtn');

// Estado global
let currentPage = 1;
let totalPages = 0;

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
  
  try {
    expansionSelect.innerHTML = '<option value="">Cargando expansiones...</option>';
    
    const sets = await fetchSets();
    
    if (!sets.length) {
      throw new Error('No se pudieron cargar las expansiones');
    }

    // Ordenar por fecha
    sets.sort((a, b) => {
      if (a.releaseDate && b.releaseDate) {
        return new Date(b.releaseDate) - new Date(a.releaseDate);
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    // Renderizar opciones
    expansionSelect.innerHTML = `
      <option value="">Cualquier expansión</option>
      ${sets.map(set => `
        <option value="${set.id}">
          ${set.name}${set.releaseDate ? ` (${set.releaseDate.slice(0,4)})` : ''}
        </option>
      `).join('')}
    `;

  } catch (err) {
    console.error('Error cargando expansiones:', err);
    expansionSelect.innerHTML = `
      <option value="">Error cargando expansiones</option>
    `;
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

// Función principal de búsqueda
async function searchCards(params = {}) {
  try {
    LoadingState.show(); // Ahora LoadingState estará definido
    cardsGrid.innerHTML = '<div class="loading">Buscando cartas...</div>';

    const filters = {
      name: searchName?.value?.trim(),
      setId: expansionSelect?.value,
      number: cardNumber?.value?.trim(),
      rarities: raritySelect?.value ? [raritySelect.value] : [],
      page: params.page || currentPage,
      pageSize: 20
    };

    const { cards, totalCount, page } = await fetchCardsByQuery(filters);
    
    // Actualizar estado
    currentPage = page;
    totalPages = Math.ceil(totalCount / 20);

    // Renderizar resultados
    renderResults(cards, totalCount);
    renderPagination();

  } catch (error) {
    console.error('Error en búsqueda:', error);
    cardsGrid.innerHTML = '<div class="error">Error al buscar cartas</div>';
  } finally {
    LoadingState.hide(); // Y aquí también funcionará
  }
}

// Reemplaza la función loadCardImage con esta versión más simple:
async function loadCardImage(imgElement, url) {
    if (!url) {
        imgElement.src = 'css/pokeball.svg';
        return;
    }

    try {
        imgElement.src = url;
        imgElement.onerror = () => {
            imgElement.src = 'css/pokeball.svg';
        };
    } catch (error) {
        console.warn('Error cargando imagen:', url, error);
        imgElement.src = 'css/pokeball.svg';
    }
}

// Renderizar resultados
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
                    ${escapeHtml(card.set?.name || '')} • 
                    #${escapeHtml(card.number || '')} • 
                    ${escapeHtml(card.rarity || '')}
                </div>
            </div>
        `;
        // --- ESTE ES EL CLICK QUE ABRE EL MODAL ---
        cardEl.addEventListener('click', () => openModal(card));
        fragment.appendChild(cardEl);
    });

    cardsGrid.innerHTML = '';
    cardsGrid.appendChild(fragment);
}

// Renderizar paginación
function renderPagination() {
  const paginationContainer = document.querySelector('.pagination') || document.createElement('div');
  paginationContainer.className = 'pagination';

  if (totalPages <= 1) {
    paginationContainer.remove();
    return;
  }

  paginationContainer.innerHTML = `
    <button 
      ${currentPage === 1 ? 'disabled' : ''} 
      onclick="changePage(${currentPage - 1})"
    >Anterior</button>
    
    <span>Página ${currentPage} de ${totalPages}</span>
    
    <button 
      ${currentPage >= totalPages ? 'disabled' : ''} 
      onclick="changePage(${currentPage + 1})"
    >Siguiente</button>
  `;

  if (!paginationContainer.parentElement) {
    cardsGrid.insertAdjacentElement('afterend', paginationContainer);
  }
}

// Cambiar página
window.changePage = async function(page) {
  currentPage = page;
  await searchCards({ page });
  window.scrollTo(0, 0);
}

// --- Lógica de control del Modal ---
const modalCloseHandler = (event) => {
  if (event.key === 'Escape' || event.target.id === 'cardModal') {
    closeModal();
  }
};

function buildCardmarketUrl(card) {
    // Usamos el nombre y el set para formar la URL de búsqueda
    const baseUrl = "https://www.cardmarket.com/es/Pokemon/Products/Singles";
    const setName = card.set?.name ? encodeURIComponent(card.set.name.replace(/ /g, "-")) : "";
    const cardName = card.name ? encodeURIComponent(card.name.replace(/ /g, "-")) : "";
    return `${baseUrl}/${setName}/${cardName}`;
}

function openModal(card) {
    const modal = document.getElementById('cardModal');
    if (!modal) return;

    // Precios de Cardmarket con enlace directo
    let cardmarketHtml = '';
    if (card.cardmarket?.prices) {
        cardmarketHtml = `
            <div class="cardmarket-prices">
                <h3>Precios Cardmarket</h3>
                <ul>
                    <li><strong>Precio medio:</strong> ${card.cardmarket.prices.averageSellPrice?.toFixed(2) || 'N/A'} €</li>
                    <li><strong>Precio tendencia:</strong> ${card.cardmarket.prices.trendPrice?.toFixed(2) || 'N/A'} €</li>
                    <li><strong>Precio más bajo:</strong> ${card.cardmarket.prices.lowPrice?.toFixed(2) || 'N/A'} €</li>
                    ${card.cardmarket.prices.lowPriceExPlus ? `<li><strong>Precio más bajo (EX+):</strong> ${card.cardmarket.prices.lowPriceExPlus.toFixed(2)} €</li>` : ''}
                    <li>
                        <a href="${buildCardmarketUrl(card)}" target="_blank" rel="noopener noreferrer">
                            Ver en Cardmarket
                        </a>
                    </li>
                </ul>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            <div class="modal-body">
                <div class="modal-image">
                    <img src="${card.images?.large || card.images?.small}" alt="${escapeHtml(card.name)}">
                </div>
                <div class="modal-info">
                    <h2>${escapeHtml(card.name)}</h2>
                    <div class="basic-info">
                        <p><strong>Set:</strong> ${escapeHtml(card.set?.name || '')}</p>
                        <p><strong>Número:</strong> ${escapeHtml(card.number || '')}</p>
                        <p><strong>Rareza:</strong> ${escapeHtml(card.rarity || 'N/A')}</p>
                    </div>
                    ${cardmarketHtml}
                </div>
            </div>
        </div>
    `;
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('cardModal');
    if (modal) {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
}
window.closeModal = closeModal;

// Fetch y renderizado de noticias
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

    // Fuentes RSS
    const sources = [
        {
            name: "JustinBasil",
            url: "https://www.pokebeach.com/feed"
        },
        {
            name: "Pokémon Oficial",
            url: "https://www.pokeguardian.com/rss"
        }
    ];

    let allNews = [];

    for (const src of sources) {
        const items = await fetchNewsRSS(src.url);
        // Tomar solo las 2 más recientes de cada fuente
        const latest = items
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
            .slice(0, 2)
            .map(item => ({
                title: item.title,
                link: item.link,
                date: item.pubDate,
                source: src.name,
                description: item.description
            }));
        allNews = allNews.concat(latest);
    }

    // Ordena por fecha descendente
    allNews.sort((a, b) => new Date(b.date) - new Date(a.date));

    newsList.innerHTML = allNews.length
        ? allNews.map(news => `
            <article class="news-item">
                <h3>${news.title}</h3>
                <p>${news.description.replace(/<[^>]+>/g, '').slice(0, 120)}...</p>
                <small>${news.source} · ${new Date(news.date).toLocaleDateString()}</small><br>
                <a href="${news.link}" target="_blank" rel="noopener">Leer más</a>
            </article>
        `).join('')
        : '<div class="news-item">No hay noticias recientes.</div>';
}

// Event Listeners
function setupEventListeners() {
  // Búsqueda por nombre with debounce
  searchName?.addEventListener('input', debounce(() => {
    currentPage = 1;
    searchCards();
  }, 300));

  // Búsqueda al presionar Enter
  searchName?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentPage = 1;
      searchCards();
    }
  });

  // Botón de búsqueda
  buscarBtn?.addEventListener('click', () => {
    currentPage = 1;
    searchCards();
  });

  // Cambio de filtros
  [expansionSelect, raritySelect].forEach(element => {
    element?.addEventListener('change', () => {
      currentPage = 1;
      searchCards();
    });
  });

  // Limpiar filtros
  clearBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    searchName.value = '';
    expansionSelect.value = '';
    raritySelect.value = '';
    cardNumber.value = '';
    currentPage = 1;
    cardsGrid.innerHTML = '';
    document.querySelector('.pagination')?.remove();
  });
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  populateSets();
  setupEventListeners();
  renderNewsSidebar();
});