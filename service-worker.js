// ------------------------------------------------------------
// FORCE UPDATE + DELETE OLD CACHES
// ------------------------------------------------------------
self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => caches.delete(key)))
        )
    );
    self.clients.claim();
});

// ------------------------------------------------------------
// ALWAYS FETCH FRESH FILES (no caching)
// ------------------------------------------------------------
self.addEventListener("fetch", event => {
    event.respondWith(fetch(event.request));
});