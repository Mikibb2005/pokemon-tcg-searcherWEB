import { AppState } from './state.js';
import { ApiCache } from './cache.js';

// js/api.js (ES module)
// Simple wrapper for Pokemon TCG API v2 with a local fallback for sets.
const API_BASE = 'https://api.pokemontcg.io/v2'; // Apuntar SIEMPRE a la API oficial
const API_KEY = '21d327be-a947-4b16-bb5c-57b7756f9c5a';

let pendingRequests = new Map();

async function apiFetch(path, params = {}) {
    const url = new URL(API_BASE + path);
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
    });

    const urlString = url.toString();
    
    // Si ya hay una petición pendiente para esta URL, esperar su resultado
    if (pendingRequests.has(urlString)) {
        return pendingRequests.get(urlString);
    }

    const promise = fetch(urlString, {
        headers: { 'X-Api-Key': API_KEY }
    }).then(async response => {
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        pendingRequests.delete(urlString);
        return data;
    });

    pendingRequests.set(urlString, promise);
    return promise;
}

export async function fetchSets() {
  try {
    // Cargar siempre los sets desde el archivo local para evitar CORS y mejorar la velocidad.
    const resp = await fetch('data/sets.json');
    if (!resp.ok) {
      throw new Error('No se pudo cargar el archivo local de sets.');
    }
    const localData = await resp.json();
    
    localData.sort((a, b) => {
      if (a.releaseDate && b.releaseDate) {
        return new Date(b.releaseDate) - new Date(a.releaseDate);
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    return localData;
  } catch (localError) {
    console.error('Error crítico cargando sets desde archivo local:', localError);
    return []; // Devolver vacío si falla para que la app no se rompa.
  }
}

export async function fetchCardsByQuery(params) {
    const cacheKey = `cards-${JSON.stringify(params)}`;
    
    // Intentar obtener del caché primero
    const cached = await ApiCache.get(cacheKey);
    if (cached) {
        console.log('Datos servidos desde caché:', cacheKey);
        return cached;
    }

    try {
        const { name, setId, rarities, number, page = 1, pageSize = 20 } = params;
        const queryParts = [];
        
        if (name) queryParts.push(`name:"${name}*"`);
        if (setId) queryParts.push(`set.id:"${setId}"`);
        if (number) queryParts.push(`number:"${number}"`);
        if (rarities?.length) {
            const raritiesQuery = rarities.map(r => `rarity:"${r}"`).join(' OR ');
            queryParts.push(`(${raritiesQuery})`);
        }

        const apiParams = {
            page: String(page),
            pageSize: String(pageSize),
            orderBy: 'number',
            q: queryParts.join(' ')
        };

        const data = await apiFetch('/cards', apiParams);
        const result = {
            cards: data.data || [],
            totalCount: data.totalCount || 0,
            page: data.page || 1,
            pageSize: data.pageSize || pageSize
        };

        // Guardar en caché
        await ApiCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Error en búsqueda:', error);
        throw error;
    }
}
