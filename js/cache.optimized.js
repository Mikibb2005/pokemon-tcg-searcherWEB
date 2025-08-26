// js/cache.optimized.js
// Image + JSON cache using IndexedDB (simple wrapper)
// Exports: ImageCache, ApiCache

(function(global){
  const DB_NAME = 'ptcg-cache-v1';
  const DB_VERSION = 1;
  const IMG_STORE = 'images';
  const API_STORE = 'api';

  function openDB(){
    return new Promise((resolve, reject)=>{
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains(IMG_STORE)){
          const s = db.createObjectStore(IMG_STORE, {keyPath: 'url'});
          s.createIndex('timestamp','timestamp');
        }
        if(!db.objectStoreNames.contains(API_STORE)){
          const s2 = db.createObjectStore(API_STORE, {keyPath: 'url'});
          s2.createIndex('timestamp','timestamp');
        }
      };
      r.onsuccess = e => resolve(e.target.result);
      r.onerror = e => reject(e.target.error);
    });
  }

  async function idbGet(store, key){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction(store,'readonly');
      const s = tx.objectStore(store);
      const req = s.get(key);
      req.onsuccess = ()=>res(req.result);
      req.onerror = ()=>rej(req.error);
    });
  }

  async function idbPut(store, value){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction(store,'readwrite');
      const s = tx.objectStore(store);
      const req = s.put(value);
      req.onsuccess = ()=>res(req.result);
      req.onerror = ()=>rej(req.error);
    });
  }

  async function idbDelete(store, key){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction(store,'readwrite');
      const s = tx.objectStore(store);
      const req = s.delete(key);
      req.onsuccess = ()=>res(true);
      req.onerror = ()=>rej(req.error);
    });
  }

  const ImageCache = {
    async get(url){
      try{ return await idbGet(IMG_STORE, url); }catch(e){return null}
    },
    async put(url, blob, etag=null){
      const item = {url, blob, etag, timestamp: Date.now()};
      // store blob as ArrayBuffer to avoid structured clone issues in some browsers
      const arrayBuffer = await blob.arrayBuffer();
      item.blob = arrayBuffer;
      await idbPut(IMG_STORE, item);
      return true;
    },
    async asObjectURL(url){
      const rec = await ImageCache.get(url);
      if(!rec) return null;
      const ab = rec.blob;
      const blob = new Blob([ab]);
      return URL.createObjectURL(blob);
    },
    async cleanup(maxAgeMs){
      // delete images older than maxAgeMs
      const db = await openDB();
      return new Promise((res, rej)=>{
        const tx = db.transaction(IMG_STORE,'readwrite');
        const s = tx.objectStore(IMG_STORE);
        const idx = s.index('timestamp');
        const bound = IDBKeyRange.upperBound(Date.now() - maxAgeMs);
        const req = idx.openCursor(bound);
        req.onsuccess = e => {
          const cur = e.target.result;
          if(cur){ s.delete(cur.primaryKey); cur.continue(); } else res(true);
        };
        req.onerror = e => rej(e.target.error);
      });
    }
  };

  const ApiCache = {
    async get(url){ return await idbGet(API_STORE, url); },
    async put(url, json, etag=null){
      const item = {url, json, etag, timestamp: Date.now()};
      await idbPut(API_STORE,item);
      return true;
    }
  };

  global.PTCGCache = {ImageCache, ApiCache};
})(window);
