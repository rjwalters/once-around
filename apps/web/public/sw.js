/**
 * Once Around Service Worker
 * Provides offline support for the star map application.
 *
 * Offline strategy (issue #145):
 * - On install, precache the app shell, every hashed JS/CSS/WASM bundle output
 *   (injected at build time, see below), and the core star data needed for the
 *   first render. Install FAILS if any required item fails, so a partially
 *   populated cache is never activated.
 * - Navigations are network-first with an explicit fallback to the precached
 *   shell, so reopening `/` (or a share URL with query/hash state) offline
 *   works on the very first offline visit.
 * - Satellite ephemerides and videos.json stay network-first (fresh data
 *   preferred, cached copy used offline).
 */

// Build placeholders. `vite build` rewrites these two literals in dist/sw.js
// (plugin `sw-precache-manifest` in vite.config.ts, helpers in
// src/sw-manifest.ts). In dev they stay as-is: an empty asset list and a
// `dev` cache version. Do not reformat these lines without updating
// src/sw-manifest.ts — the build fails if a placeholder goes missing.
const BUILD_VERSION = /* __SW_BUILD_VERSION__ */ 'dev';
const BUILD_ASSETS = /* __SW_BUILD_ASSETS__ */ [];

const CACHE_VERSION = BUILD_VERSION;
const STATIC_CACHE = `once-around-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `once-around-dynamic-${CACHE_VERSION}`;

// App shell for the main star map. Navigations fall back to this when offline.
const SHELL_URL = '/';

// Required for a usable offline app: shell, bundle outputs, core star data
// (fetched in createEngine() in src/engine.ts). Install fails if any fails.
const REQUIRED_PRECACHE = [
  SHELL_URL,
  '/data/stars/bsc5-tier1.bin',
  '/data/stars/constellation-stars.bin',
  ...BUILD_ASSETS,
];

// Nice-to-have static assets: cached best-effort into the static cache.
const OPTIONAL_PRECACHE = [
  '/test.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
  '/data/stars/bsc5-tier2.bin',
  '/data/stars/bsc5-tier3.bin',
];

// Network-first data, seeded best-effort into the DYNAMIC cache (the same cache
// networkFirst() refreshes) so the first visit leaves usable offline copies
// without a stale static copy shadowing later network updates.
const OPTIONAL_DYNAMIC_PRECACHE = [
  '/data/iss_ephemeris.bin',
  '/data/hubble_ephemeris.bin',
  '/videos.json',
];

// Precache entries are fetched without an Origin header, but module scripts and
// `crossorigin` preloads send one; servers that reply `Vary: Origin` (e.g.
// `vite preview`) would otherwise make every such lookup miss. All cached
// responses are same-origin, so ignoring Vary is safe.
const MATCH_OPTIONS = { ignoreVary: true };

// Patterns for assets that should use cache-first strategy
const CACHE_FIRST_PATTERNS = [
  /\.jpg$/,
  /\.png$/,
  /\.svg$/,
  /\.wasm$/,
  /\/data\/stars\//,
  /\/deep-fields\//,
  /\/messier\//,
];

// Patterns for assets that should use network-first strategy (fresh data preferred)
const NETWORK_FIRST_PATTERNS = [
  /ephemeris.*\.bin$/,
  /videos\.json$/,
];

/**
 * Fetch `url` and store it in `cache`. Throws on a network error or non-OK
 * status. Content-hashed `/assets/*` files may come from the HTTP cache (the
 * page usually just downloaded them); everything else is revalidated so the
 * shell and data match the deployed build.
 *
 * Redirected responses (e.g. Cloudflare Pages serving `/test.html` via a
 * redirect to `/test`) are re-wrapped: a response with `redirected: true`
 * cannot be used to answer a navigation request.
 */
async function precacheOne(cache, url) {
  const request = new Request(url, { cache: url.startsWith('/assets/') ? 'default' : 'no-cache' });
  let response = await fetch(request);
  if (!response.ok) {
    throw new Error(`[SW] Precache failed for ${url}: HTTP ${response.status}`);
  }
  if (response.redirected) {
    response = new Response(await response.blob(), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  await cache.put(url, response);
}

/**
 * Install event - pre-cache the app shell, bundle and core data.
 */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const staticCache = await caches.open(STATIC_CACHE);
    const dynamicCache = await caches.open(DYNAMIC_CACHE);

    // Required: any failure rejects waitUntil, so this worker is discarded and
    // never activates with a partial cache.
    await Promise.all(REQUIRED_PRECACHE.map((url) => precacheOne(staticCache, url)));

    // Optional: tolerate individual failures.
    const optional = await Promise.allSettled([
      ...OPTIONAL_PRECACHE.map((url) => precacheOne(staticCache, url)),
      ...OPTIONAL_DYNAMIC_PRECACHE.map((url) => precacheOne(dynamicCache, url)),
    ]);
    for (const result of optional) {
      if (result.status === 'rejected') console.warn(result.reason);
    }

    console.log(`[SW] Precached ${REQUIRED_PRECACHE.length} required assets (${CACHE_VERSION})`);
    // Activate immediately without waiting for existing clients to close
    await self.skipWaiting();
  })());
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
 * Cache-first strategy: try cache, fall back to network.
 * `caches.match` searches every cache, including the precached static cache.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH_OPTIONS);
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
    const cached = await caches.match(request, MATCH_OPTIONS);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

/**
 * Navigation strategy: network first, then the precached shell.
 *
 * The shell is looked up by its canonical URL (not the request URL) so share
 * URLs like `/?ra=...&dec=...` resolve to it; the browser keeps the original
 * URL in the address bar and the app reads its state client-side. The shell
 * is never overwritten from navigations, so it always matches the hashed
 * assets precached by this same worker version.
 */
async function navigate(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(STATIC_CACHE);
    const path = new URL(request.url).pathname;
    const shellUrl = path === '/test' || path === '/test.html' ? '/test.html' : SHELL_URL;
    const cached = await cache.match(shellUrl, { ignoreSearch: true, ignoreVary: true });
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
  const cached = await caches.match(request, MATCH_OPTIONS);

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
  if (request.mode === 'navigate') {
    // Page loads: fresh HTML online, precached shell offline
    event.respondWith(navigate(request));
  } else if (matchesPattern(url, NETWORK_FIRST_PATTERNS)) {
    // Ephemeris and dynamic data: prefer fresh
    event.respondWith(networkFirst(request));
  } else if (matchesPattern(url, CACHE_FIRST_PATTERNS)) {
    // Images, WASM, star data: cache-first
    event.respondWith(cacheFirst(request));
  } else if (url.includes('/assets/')) {
    // Built JS/CSS assets (hashed): cache-first
    event.respondWith(cacheFirst(request));
  } else {
    // Other resources: stale-while-revalidate
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
