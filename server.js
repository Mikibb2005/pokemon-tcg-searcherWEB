/**
 * server.js
 * Proxy para PokéTCG API + reescalador y conversor de imágenes.
 *
 * Endpoints:
 *  - GET /api/cards?...   -> passthrough a https://api.pokemontcg.io/v2/cards (añade X-Api-Key)
 *  - GET /api/sets?...    -> passthrough sets
 *  - GET /api/card/:id    -> passthrough single card
 *  - GET /img/proxy?src=<url>&w=<width>
 *
 * Crea un cache en disco para miniaturas en IMG_CACHE_DIR indicado en .env
 *
 * Requisitos: npm i express node-fetch@2 sharp cors dotenv morgan
 */

import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(morgan('tiny'));

const API_BASE = 'https://api.pokemontcg.io/v2';
const KEY = process.env.PTCG_API_KEY;
if(!KEY){
  console.error("Define PTCG_API_KEY en .env");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const IMG_CACHE_DIR = process.env.IMG_CACHE_DIR || path.join(__dirname, 'imgcache');
if(!fs.existsSync(IMG_CACHE_DIR)) fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });

// Helper: validar que src viene de dominios permitidos (evita SSRF)
const ALLOWED_IMAGE_HOSTS = [
  'images.pokemontcg.io',
  'assets.pokemon.com',
  'images.pokemontcg.io' // repetir por si
];

function isAllowedImageUrl(u){
  try {
    const parsed = new URL(u);
    return ALLOWED_IMAGE_HOSTS.includes(parsed.hostname);
  } catch(e){ return false; }
}

// Passthrough genérico para /api/cards y /api/sets y /api/cards/:id
app.get('/api/:resource', async (req, res) => {
  const resource = req.params.resource; // e.g. cards, sets
  // allow only known resources
  if(!['cards','sets'].includes(resource)){
    return res.status(404).json({error:'resource not allowed'});
  }
  const qs = new URLSearchParams(req.query).toString();
  const url = `${API_BASE}/${resource}${qs ? '?'+qs : ''}`;
  try {
    const r = await fetch(url, { headers: { 'X-Api-Key': KEY } });
    const text = await r.text();
    res.status(r.status).send(text);
  } catch(err){
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/card/:id', async (req,res) => {
  const id = req.params.id;
  const url = `${API_BASE}/cards/${encodeURIComponent(id)}`;
  try {
    const r = await fetch(url, { headers: { 'X-Api-Key': KEY } });
    const text = await r.text();
    res.status(r.status).send(text);
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

/**
 * /img/proxy?src=<encoded url>&w=<width>&format=webp
 * - valida hostname permitido
 * - guarda en disco con hash de la url+params
 * - convierte a webp y reescala con sharp
 */
import crypto from 'crypto';
function cacheFilenameFor(src, w, fmt){
  const h = crypto.createHash('sha1').update(src + '|' + (w||'') + '|' + (fmt||'')).digest('hex');
  const ext = (fmt === 'webp') ? 'webp' : (fmt || 'jpg');
  return path.join(IMG_CACHE_DIR, `${h}.${ext}`);
}

app.get('/img/proxy', async (req,res) => {
  const src = req.query.src;
  const w = parseInt(req.query.w || '0', 10) || 0;
  const fmt = req.query.format === 'webp' ? 'webp' : 'jpg';
  if(!src) return res.status(400).send('missing src');
  if(!isAllowedImageUrl(src)) return res.status(403).send('image host not allowed');

  const cacheFile = cacheFilenameFor(src, w, fmt);
  if(fs.existsSync(cacheFile)){
    // cached - serve with aggressive cache headers
    res.set('Cache-Control','public, max-age=86400'); // 24h
    return res.sendFile(cacheFile);
  }

  try {
    const r = await fetch(src, { timeout: 10000 });
    if(!r.ok) return res.status(502).send('upstream image error');
    const buffer = await r.buffer();

    // sharp pipeline
    let img = sharp(buffer).rotate();
    if(w > 0) img = img.resize({ width: Math.min(w, 1200), withoutEnlargement: true });
    if(fmt === 'webp') img = img.webp({ quality: 70 });
    else img = img.jpeg({ quality: 75 });

    const outBuf = await img.toBuffer();
    fs.writeFileSync(cacheFile, outBuf);
    res.set('Cache-Control','public, max-age=86400');
    res.type(fmt === 'webp' ? 'image/webp' : 'image/jpeg');
    return res.send(outBuf);
  } catch(err){
    console.error('img proxy error', err);
    return res.status(500).send('img proxy error');
  }
});

// opcional: servir ficheros estáticos del proyecto (index.html, css, js)
const staticDir = path.join(__dirname, 'public'); // si pones tus archivos en /public
if(fs.existsSync(staticDir)){
  app.use(express.static(staticDir));
}

// fallback message
app.get('/', (req,res) => res.send('PTCG proxy running'));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
