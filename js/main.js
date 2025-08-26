// js/main.js (ES module)
import { debounce } from './utils.js';
import { fetchCardsByQuery, fetchSets, LANGUAGES } from './api.js';
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
const apiToggle = document.getElementById('apiToggle');
const apiLabel = document.getElementById('apiLabel');

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

        // Agrupar sets por series
        const seriesGroups = sets.reduce((groups, set) => {
            const serie = set.series || 'Otras';
            if (!groups[serie]) {
                groups[serie] = [];
            }
            groups[serie].push({
                ...set,
                cardCount: {
                    total: set.cardCount?.total || set.cardCount?.official || 0
                }
            });
            return groups;
        }, {});

        // Crear el HTML con optgroups por serie
        const optionsHtml = Object.entries(seriesGroups)
            .sort(([serieA, setsA], [serieB, setsB]) => {
                // Ordenar series por fecha del set más reciente
                const latestSetA = setsA[0];
                const latestSetB = setsB[0];
                return new Date(latestSetB.releaseDate || 0) - new Date(latestSetA.releaseDate || 0);
            })
            .map(([serie, serieSets]) => `
                <optgroup label="${serie}">
                    ${serieSets.map(set => `
                        <option value="${set.id}">
                            ${set.name} 
                            ${set.releaseDate ? 
                                `(${new Date(set.releaseDate).toLocaleDateString('es-ES', {
                                    year: 'numeric',
                                    month: 'short'
                                })})` : 
                                ''}
                            - ${set.cardCount.total} cartas
                        </option>
                    `).join('')}
                </optgroup>
            `).join('');

        expansionSelect.innerHTML = `
            <option value="">Cualquier expansión</option>
            ${optionsHtml}
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
        
        if (!response || !response.cards) {
            throw new Error('Respuesta inválida de la API');
        }

        // Actualizar estado
        currentPage = response.page;
        totalPages = response.totalPages;

        // Renderizar resultados
        if (response.cards.length > 0) {
            renderResults(response.cards);
            renderPagination();
        } else {
            cardsGrid.innerHTML = '<div class="no-results">No se encontraron cartas</div>';
        }

    } catch (error) {
        console.error('Error en búsqueda:', error);
        cardsGrid.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
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
                    ${escapeHtml(card.set?.name || '')}
                    ${card.number ? ` • #${escapeHtml(card.number)}` : ''}
                    ${card.rarity ? ` • ${escapeHtml(card.rarity)}` : ''}
                </div>
            </div>
        `;
        cardEl.addEventListener('click', () => openModal(card));
        fragment.appendChild(cardEl);
    });

    cardsGrid.innerHTML = '';
    cardsGrid.appendChild(fragment);
}

// Mejorar la función renderPagination para mostrar más información
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
            onclick="changePage(1)"
            title="Primera página"
        >«</button>
        
        <button 
            ${currentPage === 1 ? 'disabled' : ''} 
            onclick="changePage(${currentPage - 1})"
            title="Página anterior"
        >‹</button>
        
        <span>
            Página ${currentPage} de ${totalPages}
            <small>(50 cartas por página)</small>
        </span>
        
        <button 
            ${currentPage >= totalPages ? 'disabled' : ''} 
            onclick="changePage(${currentPage + 1})"
            title="Página siguiente"
        >›</button>
        
        <button 
            ${currentPage >= totalPages ? 'disabled' : ''} 
            onclick="changePage(${totalPages})"
            title="Última página"
        >»</button>
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

function getRarityClass(rarity) {
    if (!rarity) return '';
    
    const rarityLower = rarity.toLowerCase();
    if (rarityLower.includes('common')) return 'common';
    if (rarityLower.includes('uncommon')) return 'uncommon';
    if (rarityLower.includes('rare') && !rarityLower.includes('ultra') && !rarityLower.includes('secret')) return 'rare';
    if (rarityLower.includes('ultra rare')) return 'ultra-rare';
    if (rarityLower.includes('secret')) return 'secret-rare';
    return '';
}

function openModal(card) {
    const modal = document.getElementById('cardModal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            <div class="modal-body">
                <div class="modal-image">
                    <img src="${card.images.large}" alt="${escapeHtml(card.name)}">
                    
                    <div class="language-selector">
                        <h3>Idiomas disponibles</h3>
                        <select id="cardLanguage" onchange="changeCardLanguage(this.value, '${card.id}')">
                            ${Object.entries(LANGUAGES).map(([code, name]) => `
                                <option value="${code}" ${code === 'es' ? 'selected' : ''}>
                                    ${name}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="modal-info">
                    <div class="card-header">
                        <h2>${escapeHtml(card.name)}</h2>
                        <span class="card-number">#${escapeHtml(card.number)}</span>
                    </div>

                    <div class="detail-section">
                        <h3>Información básica</h3>
                        <ul>
                            <li><strong>Set:</strong> ${escapeHtml(card.set.name)} 
                                ${card.set.series ? `(${escapeHtml(card.set.series)})` : ''}</li>
                            <li>
                                <strong>Rareza:</strong> 
                                <span class="rarity-badge ${getRarityClass(card.rarity)}">
                                    ${escapeHtml(card.rarity || 'N/A')}
                                </span>
                            </li>
                            ${card.illustrator ? `
                                <li>
                                    <strong>Ilustrador:</strong> 
                                    <span class="illustrator">
                                        ${escapeHtml(card.illustrator)}
                                    </span>
                                </li>
                            ` : ''}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Event listeners para cerrar
    document.addEventListener('keydown', modalCloseHandler);
    modal.addEventListener('click', modalCloseHandler);
}

// Añade esta función para cerrar el modal
function closeModal() {
    const modal = document.getElementById('cardModal');
    if (modal) {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        // Limpiar los event listeners
        document.removeEventListener('keydown', modalCloseHandler);
        modal.removeEventListener('click', modalCloseHandler);
    }
}

// Hacer accesible la función closeModal globalmente
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

    // Cambio de expansión
    expansionSelect?.addEventListener('change', () => {
        currentPage = 1;
        // Si solo se selecciona una expansión, buscar todas sus cartas
        if (expansionSelect.value && !searchName.value.trim()) {
            searchCards();
        }
    });

    // Select de tamaño de página
    const pageSizeSelect = document.createElement('select');
    pageSizeSelect.innerHTML = `
        <option value="20">20 cartas/página</option>
        <option value="50" selected>50 cartas/página</option>
        <option value="100">100 cartas/página</option>
    `;
    pageSizeSelect.addEventListener('change', () => {
        currentPage = 1;
        searchCards();
    });
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  populateSets();
  setupEventListeners();
  renderNewsSidebar();
});