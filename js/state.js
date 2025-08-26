export const AppState = {
  currentPage: 1,
  currentFilters: {},
  isLoading: false,
  totalCards: 0,
  cache: new Map(),
  
  setState(newState) {
    Object.assign(this, newState);
    this.notifyListeners();
  },
  
  listeners: new Set(),
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
  
  notifyListeners() {
    this.listeners.forEach(listener => listener(this));
  }
};

export const LoadingState = {
  show() {
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.innerHTML = `
      <div class="loader-spinner"></div>
      <div class="loader-text">Cargando...</div>
    `;
    document.body.appendChild(loader);
  },
  
  hide() {
    document.querySelector('.loader')?.remove();
  }
};