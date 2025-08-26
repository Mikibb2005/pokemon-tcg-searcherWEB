// js/api.js (ES module)
// Simple wrapper for Pokemon TCG API v2 with a local fallback for sets.
const API_BASE = 'https://api.pokemontcg.io/v2';
const API_KEY = '21d327be-a947-4b16-bb5c-57b7756f9c5a';

async function apiFetch(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.keys(params || {}).forEach(k => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
      url.searchParams.set(k, params[k]);
    }
  });
  const resp = await fetch(url.toString(), {
    headers: { 'X-Api-Key': API_KEY }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(()=>null);
    throw new Error(`API error ${resp.status}: ${text || resp.statusText}`);
  }
  return resp.json();
}

export async function fetchSets() {
  // Try live API first; if it fails, fallback to local data/sets.json (bundled).
  try {
    const json = await apiFetch('/sets', { pageSize: 250 });
    if (json && Array.isArray(json.data) && json.data.length) return json.data;
  } catch (err) {
    // live API failed, fallback to local sets.json
  }
  // Fallback: load local file (bundled under /data/sets.json)
  try {
    const resp = await fetch('../data/sets.json');
    if (!resp.ok) throw new Error('Local sets.json not available');
    const j = await resp.json();
    if (j && Array.isArray(j.data)) return j.data;
    if (j && Array.isArray(j.sets)) return j.sets;
    return [];
  } catch (err) {
    console.error('Unable to load sets from API or local file:', err);
    return [];
  }
}

function escapeQueryValue(v) {
  // For API query, wrap in quotes to handle spaces.
  return `"${String(v).replace(/"/g, '\\"')}"`;
}

export async function fetchCardsByQuery({ name, setId, rarities = [], number, pageSize = 250, page = 1 }) {
  const qParts = [];
  if (name) {
    // wildcard search for partial name matches
    qParts.push(`name:${escapeQueryValue(name)}*`);
  }
  if (setId) {
    qParts.push(`set.id:${escapeQueryValue(setId)}`);
  }
  if (number) {
    qParts.push(`number:${escapeQueryValue(String(number))}`);
  }
  if (Array.isArray(rarities) && rarities.length) {
    const r = rarities.map(r => `rarity:${escapeQueryValue(r)}`).join(' OR ');
    qParts.push(`(${r})`);
  }
  const q = qParts.join(' ');
  const params = { pageSize: String(pageSize), page: String(page) };
  if (q) params.q = q;
  try {
    const json = await apiFetch('/cards', params);
    return json.data || [];
  } catch (err) {
    console.error('fetchCardsByQuery error:', err);
    return [];
  }
}
