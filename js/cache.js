const DB_NAME = 'ptcg-cache-v2';
const DB_VERSION = 1;
const API_STORE = 'api-cache';
const IMG_STORE = 'image-cache';
const CACHE_KEY = 'tcgdex_cache';
const CACHE_DURATION = 3600000; // 1 hora

let db = null;

async function openDB() {
    if (db) return db;
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains(API_STORE)) {
                db.createObjectStore(API_STORE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(IMG_STORE)) {
                db.createObjectStore(IMG_STORE, { keyPath: 'url' });
            }
        };
    });
}

export const ApiCache = {
    async get(key) {
        try {
            const db = await openDB();
            const tx = db.transaction(API_STORE, 'readonly');
            const store = tx.objectStore(API_STORE);
            const result = await new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!result) return null;
            if (Date.now() - result.timestamp > CACHE_DURATION) {
                this.delete(key);
                return null;
            }
            return result.data;
        } catch (error) {
            console.warn('Error accediendo a caché:', error);
            return null;
        }
    },

    async set(key, data) {
        try {
            const db = await openDB();
            const tx = db.transaction(API_STORE, 'readwrite');
            const store = tx.objectStore(API_STORE);
            await new Promise((resolve, reject) => {
                const request = store.put({
                    key,
                    data,
                    timestamp: Date.now()
                });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('Error guardando en caché:', error);
        }
    },

    async delete(key) {
        const db = await openDB();
        const tx = db.transaction(API_STORE, 'readwrite');
        const store = tx.objectStore(API_STORE);
        await store.delete(key);
    }
};

// Exportar las funciones para manejo de imágenes
export async function getImage(url) {
    try {
        const db = await openDB();
        const tx = db.transaction(IMG_STORE, 'readonly');
        const store = tx.objectStore(IMG_STORE);
        const result = await new Promise((resolve, reject) => {
            const request = store.get(url);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return result?.blob;
    } catch (error) {
        console.warn('Error accediendo a caché de imágenes:', error);
        return null;
    }
}

export async function setImage(url, blob) {
    try {
        const db = await openDB();
        const tx = db.transaction(IMG_STORE, 'readwrite');
        const store = tx.objectStore(IMG_STORE);
        await new Promise((resolve, reject) => {
            const request = store.put({ url, blob });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('Error guardando imagen en caché:', error);
    }
}

export function saveToCache(key, data) {
    const cache = {
        timestamp: Date.now(),
        data: data
    };
    localStorage.setItem(`${CACHE_KEY}_${key}`, JSON.stringify(cache));
}

export function getFromCache(key) {
    const cached = localStorage.getItem(`${CACHE_KEY}_${key}`);
    if (!cached) return null;
    
    const { timestamp, data } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
        localStorage.removeItem(`${CACHE_KEY}_${key}`);
        return null;
    }
    
    return data;
}