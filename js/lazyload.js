// /src/js/lazyload.js
export function initLazyLoad(rootMargin = '200px') {
  const imgs = document.querySelectorAll('img[data-src], picture[data-src]');
  if (!imgs || imgs.length === 0) return;

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.tagName.toLowerCase() === 'img') {
          if (el.dataset.src) el.src = el.dataset.src;
          if (el.dataset.srcset) el.srcset = el.dataset.srcset;
          el.removeAttribute('data-src');
          el.removeAttribute('data-srcset');
        } else if (el.tagName.toLowerCase() === 'picture') {
          const img = el.querySelector('img');
          if (img && img.dataset.src) {
            img.src = img.dataset.src;
            if (img.dataset.srcset) img.srcset = img.dataset.srcset;
            img.removeAttribute('data-src');
            img.removeAttribute('data-srcset');
          }
        }
        obs.unobserve(el);
      });
    }, { rootMargin });

    imgs.forEach(i => io.observe(i));
  } else {
    // Fallback: cargar todo
    imgs.forEach(el => {
      const img = el.tagName.toLowerCase() === 'picture' ? el.querySelector('img') : el;
      if (!img) return;
      if (img.dataset.src) img.src = img.dataset.src;
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.removeAttribute('data-src');
      img.removeAttribute('data-srcset');
    });
  }
}
