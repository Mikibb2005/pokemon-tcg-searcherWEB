// /src/js/main.js
import { initLazyLoad } from './lazyload.js';
import { cachedFetchJSON } from './cachedFetch.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) Inicializar lazy loading para las imágenes con data-src
  initLazyLoad('200px');

  // 2) Registrar Service Worker (si soportado)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('SW registrado:', reg.scope);
    }).catch(err => {
      console.warn('SW registro fallido:', err);
    });
  }

  // 3) Ejemplo: cargar datos de la API con cachedFetch
  const apiEndpoint = '/api/items?page=1&limit=20'; // ajusta según tu API
  const app = document.getElementById('app');
  if (app) {
    cachedFetchJSON(apiEndpoint).then(data => {
      // Ejemplo sencillo: pintar lista si data.items existe
      if (Array.isArray(data.items)) {
        const ul = document.createElement('ul');
        data.items.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item.name || JSON.stringify(item);
          ul.appendChild(li);
        });
        app.appendChild(ul);
      } else {
        app.textContent = JSON.stringify(data);
      }
    }).catch(err => {
      console.error('Error fetching API:', err);
      app.textContent = 'No se pudieron cargar los datos. Estás offline?';
    });
  }
});
