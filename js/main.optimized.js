// js/main.optimized.js
// Integration file to observe images, register SW and apply caching

(async function(){
  if(!('PTCGCache' in window)){
    console.warn('PTCGCache missing — asegúrate de cargar cache.optimized.js antes');
  }
  if(!('PTCGApi' in window)){
    console.warn('PTCGApi missing — asegúrate de cargar api.optimized.js antes');
  }

  // Utils
  function looksLikeCardImageUrl(url){
    if(!url) return false;
    return url.includes('pokemon') || url.includes('images.pokemontcg');
  }

  // Replace <img> src with cached objectURL when possible
  async function processImg(img){
    try{
      // don't break images that are already processed
      if(img.dataset._ptcgOptimized) return;
      img.dataset._ptcgOptimized = '1';

      img.loading = 'lazy';

      const src = img.dataset.cardUrl || img.dataset.src || img.getAttribute('data-src') || img.src;
      if(!src || !looksLikeCardImageUrl(src)) return;

      // 1) try indexeddb
      const rec = await window.PTCGCache.ImageCache.get(src);
      if(rec){
        const objUrl = await window.PTCGCache.ImageCache.asObjectURL(src);
        if(objUrl){
          img.src = objUrl;
          return;
        }
      }

      // 2) try fetch + store
      fetch(src).then(async resp=>{
        if(!resp.ok) return;
        const blob = await resp.blob();
        const etag = resp.headers.get('ETag') || resp.headers.get('etag') || null;
        try{ await window.PTCGCache.ImageCache.put(src, blob, etag); }catch(e){/* ignore storage errors */}
        const obj = URL.createObjectURL(blob);
        img.src = obj;
      }).catch(()=>{/* network error: keep original src */});

    }catch(e){ console.error('processImg',e); }
  }

  // MutationObserver to detect images added dynamically
  const mo = new MutationObserver(muts=>{
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType !== 1) continue;
        if(n.tagName === 'IMG') processImg(n);
        else {
          const imgs = n.querySelectorAll && n.querySelectorAll('img');
          if(imgs && imgs.length) imgs.forEach(i=>processImg(i));
        }
      }
      // also check attribute changes
      if(m.type === 'attributes' && m.target && m.target.tagName==='IMG') processImg(m.target);
    }
  });
  mo.observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['src','data-src']});

  // initial scan
  document.querySelectorAll('img').forEach(img=>processImg(img));

  // Service worker registration
  if('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered');
    }catch(e){ console.warn('SW reg failed',e); }
  }

  // Expose some cleaning utilities to window for debugging
  window.PTCGOptimize = {
    cleanupImagesOlderThan(days=30){ return window.PTCGCache.ImageCache.cleanup(days*24*3600*1000); },
    getImageObjectURL: async (url)=> await window.PTCGCache.ImageCache.asObjectURL(url)
  };

})();
