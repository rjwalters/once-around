/**
 * Once Around Service Worker
 * Provides offline support for the star map application.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `once-around-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `once-around-dynamic-${CACHE_VERSION}`;

// Assets to pre-cache on install (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
];

// Patterns for assets that should use cache-first strategy
const CACHE_FIRST_PATTERNS = [
  /\.jpg$/,
  /\.png$/,
  /\.svg$/,
  /\.wasm$/,
  /\/data\/stars\//,
  /\/data\/orbits\./,
  /\/deep-fields\//,
  /\/messier\//,
];

// Patterns for assets that should use network-first strategy (fresh data preferred)
const NETWORK_FIRST_PATTERNS = [
  /ephemeris.*\.bin$/,
  /videos\.json$/,
];

/**
 * Install event - pre-cache essential assets
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        // Activate immediately without waiting for existing clients to close
        return self.skipWaiting();
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old versioned caches
              return name.startsWith('once-around-') &&
                     name !== STATIC_CACHE &&
                     name !== DYNAMIC_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Take control of all clients immediately
        return self.clients.claim();
      })
  );
});

/**
 * Check if URL matches any pattern in the list
 */
function matchesPattern(url, patterns) {
  return patterns.some(pattern => pattern.test(url));
}

/**
 * Cache-first strategy: try cache, fall back to network
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Cache-first fetch failed:', request.url);
    throw error;
  }
}

/**
 * Network-first strategy: try network, fall back to cache
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

/**
 * Stale-while-revalidate: return cache immediately, update in background
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

/**
 * Fetch event - handle requests with appropriate caching strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (except for CDN assets if any)
  if (!url.startsWith(self.location.origin)) {
    return;
  }

  // Determine caching strategy based on URL pattern
  if (matchesPattern(url, NETWORK_FIRST_PATTERNS)) {
    // Ephemeris and dynamic data: prefer fresh
    event.respondWith(networkFirst(request));
  } else if (matchesPattern(url, CACHE_FIRST_PATTERNS)) {
    // Images, WASM, star data: cache-first
    event.respondWith(cacheFirst(request));
  } else if (url.includes('/assets/')) {
    // Built JS/CSS assets (hashed): cache-first
    event.respondWith(cacheFirst(request));
  } else {
    // HTML and other resources: stale-while-revalidate
    event.respondWith(staleWhileRevalidate(request));
  }
});

/**
 * Handle messages from the main thread
 */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
