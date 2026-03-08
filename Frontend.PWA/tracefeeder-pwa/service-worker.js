// ------------------------------------------------------------
<<<<<<< HEAD
// TraceFeeder Service Worker
// Simple, safe offline caching for PWA
// ------------------------------------------------------------

const CACHE_NAME = "tracefeeder-cache-v1";

const ASSETS_TO_CACHE = [
  "index.html",
  "style.css",
  "app.js",
  "html5-qrcode.min.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

// ------------------------------------------------------------
// INSTALL: Cache core assets
// ------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// ------------------------------------------------------------
// ACTIVATE: Clean old caches
// ------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ------------------------------------------------------------
// FETCH: Cache-first strategy
// ------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() =>
          cached // fallback to cache if offline
        )
      );
    })
  );
=======
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
>>>>>>> f101bdc872d455c9e9864e6e809d92593e8f4a6a
});