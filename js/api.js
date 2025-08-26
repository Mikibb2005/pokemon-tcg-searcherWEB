import { AppState } from './state.js';
import { ApiCache } from './cache.js';


// Actualizar la URL base
const API_BASE = 'https://api.tcgdex.net/v2';

// Lenguajes disponibles en TCGdex
export const LANGUAGES = {
    'en': 'English',
    'fr': 'Français',
    'de': 'Deutsch',
    'it': 'Italiano',
    'es': 'Español'
};

// Función para obtener todas las series
export async function fetchSeries() {
    console.log('Fetching series...');
    try {
        const response = await fetch(`${API_BASE}/en/series`);
        if (!response.ok) {
            throw new Error(`Error API: ${response.status}`);
        }
        const series = await response.json();
        console.log('Series obtenidas:', series);
        return series;
    } catch (error) {
        console.error('Error obteniendo series:', error);
        throw error;
    }
}

// Función para obtener los sets de una serie específica
async function fetchSeriesSets(serieId) {
    try {
        const response = await fetch(`${API_BASE}/en/series/${serieId}`);
        if (!response.ok) {
            throw new Error(`Error API: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error obteniendo sets de la serie ${serieId}:`, error);
        return null;
    }
}

// Función para obtener todos los sets
export async function fetchSets() {
    try {
        const series = await fetchSeries();
        
        if (!Array.isArray(series)) {
            throw new Error('La respuesta de series no es un array');
        }

        // Array para almacenar todas las promesas de fetching sets
        const setPromises = series.map(async (serie) => {
            const serieData = await fetchSeriesSets(serie.id);
            if (!serieData || !serieData.sets) {
                console.warn(`No se encontraron sets para la serie ${serie.id}`);
                return [];
            }

            // Mapear los sets de esta serie
            return serieData.sets.map(set => ({
                id: set.id,
                name: set.name,
                series: serie.name,
                cardCount: {
                    total: set.cardCount?.total || 0,
                    official: set.cardCount?.official || 0
                },
                logo: set.logo || null,
                symbol: set.symbol || null,
                releaseDate: set.releaseDate || null
            }));
        });

        // Esperar a que todas las promesas se resuelvan y aplanar el array
        const allSets = (await Promise.all(setPromises)).flat();

        console.log('Sets procesados:', allSets);
        return allSets;
    } catch (error) {
        console.error('Error obteniendo sets:', error);
        throw error;
    }
}

// Modificar la función fetchCardsByQuery
export async function fetchCardsByQuery(params) {
    try {
        const { name, setId, number, rarities = [], page = 1, pageSize = 50 } = params;
        let endpoint = '';
        
        if (setId && number) {
            endpoint = `/en/sets/${setId}/${number}`;
        } else if (setId) {
            endpoint = `/en/sets/${setId}`;
        } else {
            endpoint = '/en/cards';
        }

        console.log('Fetching:', `${API_BASE}${endpoint}`);
        
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) {
            throw new Error(`Error API: ${response.status}`);
        }

        const data = await response.json();
        console.log('Datos crudos de la API:', data);

        // Obtener el array de cartas
        let cardsArray = data.cards || [data];
        
        // Mapear los datos disponibles de la API
        let cards = cardsArray.map(card => {
            if (!card) return null;
            
            return {
                id: card.id || '',
                name: card.name || '',
                number: card.localId || '',
                // Obtener rarity e illustrator de cada carta individual
                rarity: card.rarity || 'Unknown', // Usar el valor de la API si existe, sino 'Unknown'
                illustrator: card.illustrator || 'Unknown', // Usar el valor de la API si existe, sino 'Unknown'
                images: {
                    small: card.image ? `${card.image}/low.webp` : null,
                    large: card.image ? `${card.image}/high.webp` : null
                },
                set: {
                    id: setId || card.set?.id || '',
                    name: data.name || '',
                    series: data.serie?.name || ''
                }
            };
        }).filter(card => card !== null);

        // Aplicar filtros
        if (name) {
            cards = cards.filter(card => 
                card.name.toLowerCase().includes(name.toLowerCase())
            );
        }

        if (rarities.length > 0) {
            cards = cards.filter(card => 
                rarities.includes(card.rarity)
            );
        }

        // Calcular paginación
        const totalCards = cards.length;
        const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
        const paginatedCards = cards.slice((page - 1) * pageSize, page * pageSize);

        console.log('Cartas procesadas:', paginatedCards);

        return {
            cards: paginatedCards,
            totalCount: totalCards,
            page,
            pageSize,
            totalPages
        };
    } catch (error) {
        console.error('Error en búsqueda:', error);
        throw error;
    }
}
