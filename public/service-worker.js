self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // no-op for now
});

self.addEventListener('fetch', event => {
  // passthrough – you can add caching later if you want
});