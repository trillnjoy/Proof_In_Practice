/* ═══════════════════════════════════════════════
   The Cellar — Service Worker
   Cache-first for shell, network-first for seed
═══════════════════════════════════════════════ */

const CACHE_NAME    = 'cellar-v1';
const SEED_CACHE    = 'cellar-data-v1';

const SHELL_ASSETS = [
  './cocktail.html',
  './cocktail_manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lora:ital,wght@0,400;0,500;1,400&display=swap',
];

const SEED_URL = './cocktails_seed.json';

/* ── INSTALL: pre-cache shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: clean old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== SEED_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Seed JSON: network-first, fall back to cache
  if (request.url.includes('cocktails_seed.json')) {
    event.respondWith(networkFirstSeed(request));
    return;
  }

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.g')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Shell: cache-first
  event.respondWith(cacheFirst(request, CACHE_NAME));
});

async function networkFirstSeed(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SEED_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ recipes: [], bar_inventory: [] }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}
