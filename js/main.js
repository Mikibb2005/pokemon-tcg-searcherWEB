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
        
        // Asignar el evento click
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

// Modal
function openModal(card) {
    const modal = document.getElementById('cardModal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            <div class="modal-body">
                <div class="modal-image">
                    <img 
                        src="${card.images?.large || card.images?.small}" 
                        alt="${escapeHtml(card.name)}"
                        loading="lazy"
                    >
                </div>
                <div class="modal-info">
                    <h2>${escapeHtml(card.name)}</h2>
                    <div class="basic-info">
                        <p><strong>Set:</strong> ${escapeHtml(card.set?.name || '')}</p>
                        <p><strong>Número:</strong> ${escapeHtml(card.number || '')}</p>
                        <p><strong>Rareza:</strong> ${escapeHtml(card.rarity || 'N/A')}</p>
                    </div>
                    
                    ${card.cardmarket?.prices ? `
                        <div class="prices cardmarket">
                            <h3>Precios Cardmarket:</h3>
                            <ul>
                                <li>Precio medio: ${card.cardmarket.prices.averageSellPrice?.toFixed(2) || 'N/A'}€</li>
                                <li>Precio tendencia: ${card.cardmarket.prices.trendPrice?.toFixed(2) || 'N/A'}€</li>
                                <li>Precio más bajo: ${card.cardmarket.prices.lowPrice?.toFixed(2) || 'N/A'}€</li>
                                ${card.cardmarket.url ? 
                                    `<li><a href="${card.cardmarket.url}" target="_blank">Ver en Cardmarket</a></li>` : 
                                    ''}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    // Mostrar el modal
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');

    // Añadir listener para cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Añadir listener para cerrar al hacer clic fuera
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// Función para cerrar el modal
function closeModal() {
    const modal = document.getElementById('cardModal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
}

// Hacer la función closeModal disponible globalmente
window.closeModal = closeModal;

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
});