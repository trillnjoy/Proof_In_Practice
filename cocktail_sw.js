/* ═══════════════════════════════════════════════
   Proof In Practice — Service Worker
   v2026-04-27

   Strategy:
   - Shell (cocktail.html):  network-first, cache fallback
   - Seed JSON:               network-first, cache fallback
   - Google Fonts:            cache-first (stable, versioned by Google)
   - Images (/Images/):       cache-first (stable bottle PNGs)

   Cache versioning: bump CACHE_VERSION every build to match the
   footer timestamp in cocktail.html. Old caches are deleted on
   activate, so stale assets are never served to returning users.

   On update: the SW sends SKIP_WAITING when prompted by the page,
   which triggers a controllerchange event that causes a single
   automatic reload — no manual hard-refresh ever needed.
═══════════════════════════════════════════════ */

// ── BUMP THIS TO MATCH THE FOOTER TIMESTAMP ON EVERY BUILD ──
const CACHE_VERSION = '2026-04-29-q';

const SHELL_CACHE  = `pip-shell-${CACHE_VERSION}`;
const FONT_CACHE   = `pip-fonts-${CACHE_VERSION}`;
const IMAGE_CACHE  = `pip-images-${CACHE_VERSION}`;
const SEED_CACHE   = `pip-seed-${CACHE_VERSION}`;

// Assets to pre-cache on install
const SHELL_ASSETS = [
  './cocktail.html',
  './cocktail_manifest.json',
];

/* ══════════════════════════════════════════════
   INSTALL — pre-cache shell assets
══════════════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => {
        console.log('[PiP SW] Installed, cache version:', CACHE_VERSION);
        // Do NOT skipWaiting here — let the page drive the update
        // via the SKIP_WAITING message so it can reload cleanly.
      })
  );
});

/* ══════════════════════════════════════════════
   ACTIVATE — purge all caches from prior versions
══════════════════════════════════════════════ */
self.addEventListener('activate', event => {
  const currentCaches = new Set([SHELL_CACHE, FONT_CACHE, IMAGE_CACHE, SEED_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('pip-') && !currentCaches.has(k))
          .map(k => {
            console.log('[PiP SW] Deleting stale cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => {
        console.log('[PiP SW] Activated, version:', CACHE_VERSION);
        return self.clients.claim();
      })
  );
});

/* ══════════════════════════════════════════════
   MESSAGE — handle SKIP_WAITING from page
══════════════════════════════════════════════ */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[PiP SW] Received SKIP_WAITING — activating new version');
    self.skipWaiting();
  }
});

/* ══════════════════════════════════════════════
   FETCH — route by request type
══════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // GitHub API calls (Export/Import) — never cache, always pass through
  if (url.hostname === 'api.github.com') return;

  // Seed JSON — network-first so imports always reflect latest export
  if (url.pathname.endsWith('cocktails_seed.json')) {
    event.respondWith(networkFirst(request, SEED_CACHE));
    return;
  }

  // Google Fonts — cache-first (Google versions these by content hash)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Bottle images — cache-first (stable PNGs, named by content)
  if (url.pathname.includes('/Images/')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Shell (cocktail.html, manifest, icons) — network-first
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

/* ══════════════════════════════════════════════
   STRATEGIES
══════════════════════════════════════════════ */

// Network-first: try network, update cache, fall back to cache.
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { cacheName });
    if (cached) return cached;
    if (request.destination === 'document') {
      const fallback = await caches.match('./cocktail.html');
      if (fallback) return fallback;
    }
    return new Response('Proof In Practice is offline. Open the app while connected to load the latest version.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Cache-first: serve from cache, fetch and cache on miss.
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
    return new Response('Asset unavailable offline', { status: 503 });
  }
}
