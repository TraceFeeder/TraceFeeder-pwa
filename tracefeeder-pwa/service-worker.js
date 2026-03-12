// ------------------------------------------------------------
// TraceFeeder Service Worker
// Safe PWA caching for UI files only
// ------------------------------------------------------------

const CACHE_NAME = "tracefeeder-cache-v2";

const ASSETS_TO_CACHE = [
  "index.html",
  "styles.css",
  "app.js",
  "scanner.js",
  "html5-qrcode.min.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

// ------------------------------------------------------------
// INSTALL: Cache core UI assets
// ------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// ------------------------------------------------------------
// ACTIVATE: Remove old caches
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
// FETCH: Cache-first for UI files, network-first for API
// ------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response("")));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => cached)
      );
    })
  );
});