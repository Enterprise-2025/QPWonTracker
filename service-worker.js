/* QPWonQuarterTracker — service-worker.js
   - Precache core asset locali (offline-first)
   - Runtime caching per CDN (stale-while-revalidate)
   - Fallback per navigazioni quando offline
*/

const CACHE_PREFIX = 'qpq-cache';
const STATIC_CACHE = `${CACHE_PREFIX}-static-v1`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v1`;

// Elenco asset "core" da avere sempre in cache (stesso dominio)
const CORE_ASSETS = [
  './',
  './index.html',
  // CSS (metti uno o entrambi a seconda di come linki)
  './assets/css/styles.css',
  './style.css',
  // JS app (ES modules)
  './assets/js/models.js',
  './assets/js/store.js',
  './assets/js/kpi.js',
  './assets/js/charts.js',
  './assets/js/app.js',
  // PWA
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Domini da mettere in runtime caching (CDN)
const RUNTIME_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://unpkg.com'
];

// --- INSTALL: precache degli asset core ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// --- ACTIVATE: pulizia cache vecchie ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Utility: verifica se la richiesta è verso un’origine runtime
function isRuntimeOrigin(url) {
  return RUNTIME_ORIGINS.some((origin) => url.startsWith(origin));
}

// --- FETCH: strategie di caching ---
// - Navigazioni (HTML): network-first con fallback a cache (index) se offline
// - Asset locali (CSS/JS/IMG/JSON): cache-first con aggiornamento in background
// - CDN runtime (Chart.js, html2canvas, jsPDF...): stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Navigazioni (richieste HTML per pagine/app shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Prova rete (più fresca)
          const fresh = await fetch(request);
          // Aggiorna cache statica con la nuova index
          const cache = await caches.open(STATIC_CACHE);
          cache.put('./', fresh.clone());
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          // Offline: usa index dalla cache (app shell)
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match('./index.html') || await cache.match('./');
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // 2) Asset LOCALI (stesso dominio): cache-first con revalidate
  if (sameOrigin) {
    const isStaticAsset = /\.(?:css|js|png|svg|jpg|jpeg|gif|webp|ico|json|txt|map)$/.test(url.pathname);
    if (isStaticAsset) {
      event.respondWith(
        (async () => {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match(request);
          const networkPromise = fetch(request)
            .then((resp) => {
              // Salva la versione fresca
              cache.put(request, resp.clone());
              return resp;
            })
            .catch(() => undefined);

          // Ritorna subito la cache se c’è, altrimenti aspetta la rete
          return cached || networkPromise || new Response('Offline', { status: 503, statusText: 'Offline' });
        })()
      );
      return;
    }
  }

  // 3) CDN / runtime: stale-while-revalidate su RUNTIME_CACHE
  if (isRuntimeOrigin(url.origin)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((resp) => {
            cache.put(request, resp.clone());
            return resp;
          })
          .catch(() => undefined);
        return cached || fetchPromise || new Response('Offline', { status: 503, statusText: 'Offline' });
      })()
    );
    return;
  }

  // 4) Default: prova rete, poi cache (best-effort)
  event.respondWith(
    (async () => {
      try {
        const resp = await fetch(request);
        return resp;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});

// Messaggio opzionale per skipWaiting da pagina
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
