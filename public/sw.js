// Service Worker v9.0 - Life Skill Course PWA (Network-first for code, full offline app shell)
const CACHE_VERSION = 'lsc-v9';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// App shell files to pre-cache for complete offline support
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.jpg',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/vendor/preact-htm.js',
  '/src/index.js',
  '/src/app.js',
  '/src/components/Layout.js',
  '/src/pages/Login.js',
  '/src/pages/Dashboard.js',
  '/src/pages/Teams.js',
  '/src/pages/Members.js',
  '/src/pages/Stock.js',
  '/src/pages/Distribution.js',
  '/src/pages/Collections.js',
  '/src/pages/Transfers.js',
  '/src/pages/Areas.js',
  '/src/pages/Reports.js',
  '/src/pages/Finance.js',
  '/src/pages/Profile.js',
  '/src/pages/Settings.js',
  '/src/store/auth.js',
  '/src/services/api.js',
  '/src/services/db.js',
  '/src/services/pwa.js',
  '/src/services/sync.js',
  '/src/utils/format.js',
  '/src/utils/image.js'
];

// Install - cache fresh app shell (bypassing HTTP cache) and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.all(
        APP_SHELL.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch((err) => {
              console.warn('Precache miss:', url, err.message);
            })
        )
      );
    })
  );
});

// Activate - purge all older caches and refresh clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const oldKeys = keys.filter((key) => key !== STATIC_CACHE && key !== API_CACHE);
      const hadOldCaches = oldKeys.length > 0;

      await Promise.all(oldKeys.map((key) => caches.delete(key)));
      await self.clients.claim();

      if (hadOldCaches) {
        const windowClients = await self.clients.matchAll({ type: 'window' });
        for (const client of windowClients) {
          client.postMessage({ type: 'SW_CACHE_UPGRADED', version: CACHE_VERSION });
        }
      }
    })
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

  // API requests - network first with cached fallback for offline mode
  if (url.pathname.startsWith('/api/')) {
    // Don't cache login, logout or health check
    if (url.pathname.includes('/auth/login') || url.pathname.includes('/auth/logout') || url.pathname.includes('/health')) {
      return;
    }
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => {
            return cache.match(request, { ignoreSearch: true }).then((cached) => {
              if (cached) return cached;
              return new Response(
                JSON.stringify({
                  success: true,
                  offline: true,
                  data: null,
                  message: 'Offline - local cache active'
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              );
            });
          });
      })
    );
    return;
  }

  // Same-origin static requests: Network-first for code/HTML, Cache-first for images
  if (url.origin === location.origin) {
    const isCodeOrHtml =
      url.pathname === '/' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      request.mode === 'navigate' ||
      request.destination === 'document' ||
      request.headers.get('accept')?.includes('text/html');

    if (isCodeOrHtml) {
      event.respondWith(
        fetch(request, { cache: 'no-cache' })
          .then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            return caches.match(request).then((cached) => {
              if (cached) return cached;
              if (request.mode === 'navigate' || request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
                return caches.match('/index.html').then((indexCached) => indexCached || caches.match('/'));
              }
              return new Response('Offline', { status: 503 });
            });
          })
      );
      return;
    }

    // Images, fonts, icons - cache first, network fallback
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && url.pathname.match(/\.(css|jpg|jpeg|png|svg|ico|woff2?)$/)) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
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
