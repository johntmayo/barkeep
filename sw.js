const CACHE_NAME = 'barkeep-cache-v8';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './cocktails.json',
  './ingredients.json',
  './logo.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
      .catch(err => console.error('Cache install failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip caching for unsupported schemes (chrome-extension, etc.)
  // These schemes cannot be cached by service workers
  if (event.request.url.startsWith('chrome-extension://') || 
      event.request.url.startsWith('moz-extension://') ||
      event.request.url.startsWith('safari-extension://')) {
    return; // Let the browser handle it normally, don't intercept
  }
  
  // Network first for HTML to get latest updates
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Only cache if response is ok and not from unsupported scheme
          if (response.ok && 
              !response.url.startsWith('chrome-extension://') &&
              !response.url.startsWith('moz-extension://') &&
              !response.url.startsWith('safari-extension://')) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            }).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Stale-while-revalidate for JSON files
  if (event.request.url.includes('.json')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(response => {
          // Only cache if response is ok and not from unsupported scheme
          if (response.ok && 
              !response.url.startsWith('chrome-extension://') &&
              !response.url.startsWith('moz-extension://') &&
              !response.url.startsWith('safari-extension://')) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            }).catch(() => {});
          }
          return response;
        });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
  
  // Cache first for other assets
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // Update cache in background
          fetch(event.request).then(fetchResponse => {
            // Skip caching if response is not ok or from unsupported scheme
            if (!fetchResponse.ok || 
                fetchResponse.url.startsWith('chrome-extension://') ||
                fetchResponse.url.startsWith('moz-extension://') ||
                fetchResponse.url.startsWith('safari-extension://')) {
              return;
            }
            const responseToCache = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            }).catch(() => {});
          }).catch(() => {});
          return response;
        }
        return fetch(event.request).then(response => {
          // Skip caching if response is not ok or from unsupported scheme
          if (!response.ok || 
              response.url.startsWith('chrome-extension://') ||
              response.url.startsWith('moz-extension://') ||
              response.url.startsWith('safari-extension://')) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          }).catch(() => {});
          return response;
        });
      })
  );
});

// Handle update message
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
