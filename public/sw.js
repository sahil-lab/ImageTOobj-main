// Empty service worker to fix registration error
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  self.clients.claim();
});
