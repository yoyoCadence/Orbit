// Service Worker — cache-first for app shell
const CACHE = 'yoyo-v2';
const SHELL = [
  './',
  './index.html',
  './assets/style.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/leveling.js',
  './js/utils.js',
  './js/pages/home.js',
  './js/pages/goals.js',
  './js/pages/profile.js',
  './js/pages/settings.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only handle GET requests for same-origin assets
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
