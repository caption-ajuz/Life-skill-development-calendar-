// Service Worker v2.0 - Life Skill Course PWA
const CACHE_VERSION = 'lsc-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// App shell files to cache (Offline-first)
const APP_SHELL = [
  '/',
  '/index.html',
  '/logo.jpg',
  '/manifest.json',
  '/vendor/preact-htm.js',
  '/src/index.js',
  '/src/app.js',
  '/src/components/Layout.js',
  '/src/pages/Login.js',
  '/src/pages/Dashboard.js',
  '/src/store/auth.js',
  '/src/services/api.js',
  '/src/services/db.js',
  '/src/services/sync.js',
  '/src/utils/format.js',
  '/src/utils/image.js'
];

// Install - cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, DELETE)
  if (request.method !== 'GET') {
    return;
  }

  // API requests - stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => {
            // Network failed, return cached if available
            if (cached) return cached;
            return new Response(
              JSON.stringify({ success: false, error: 'Offline - no cached data' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });

          // Return cached immediately, update in background
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // Static assets and app shell - cache first, network fallback
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          // Cache successful responses for same-origin
          if (response.ok && url.pathname.match(/\.(js|css|jpg|png|svg|woff2?)$/)) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // If HTML request fails, return cached index.html for SPA routing
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // CDN requests (esm.sh) - cache first
  if (url.hostname === 'esm.sh') {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }
});

// Background sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_TRIGGERED' });
        });
      })
    );
  }
});

// Handle messages from app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
