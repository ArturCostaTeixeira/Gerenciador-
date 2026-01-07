// ExcavaNorth PWA Service Worker
const CACHE_NAME = 'excavanorth-v1';
const DYNAMIC_CACHE = 'excavanorth-dynamic-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/abastecedor.html',
    '/styles.css',
    '/abastecedor-styles.css',
    '/app.js',
    '/abastecedor-app.js',
    '/logo_excava.png',
    '/eye-open.png',
    '/eye-closed.png',
    '/manifest.json',
    '/manifest-abastecedor.json'
];

// API routes that should always go to network
const API_ROUTES = ['/api/'];

// Install event - cache static assets
self.addEventListener('install', event => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting(); // Activate immediately
            })
            .catch(err => {
                console.error('[SW] Cache failed:', err);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME && name !== DYNAMIC_CACHE)
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim(); // Take control of all pages
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip API requests - always go to network
    if (API_ROUTES.some(route => url.pathname.startsWith(route))) {
        event.respondWith(networkFirst(request));
        return;
    }

    // For static assets, try cache first
    event.respondWith(cacheFirst(request));
});

// Cache-first strategy for static assets
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // Return cached version and update cache in background
            updateCache(request);
            return cachedResponse;
        }

        // Not in cache, fetch from network
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);

        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            const cache = await caches.open(CACHE_NAME);
            return cache.match('/index.html');
        }

        throw error;
    }
}

// Network-first strategy for API calls
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network request failed, checking cache...');
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// Update cache in background
async function updateCache(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse);
        }
    } catch (error) {
        // Silent fail - cache update is not critical
    }
}

// Handle messages from the main app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                );
            })
        );
    }
});

// Background sync for offline uploads (Phase 2 feature - placeholder)
self.addEventListener('sync', event => {
    if (event.tag === 'upload-comprovante') {
        console.log('[SW] Background sync triggered for comprovante upload');
        // Future: implement offline upload queue
    }
});

console.log('[SW] Service worker script loaded');
