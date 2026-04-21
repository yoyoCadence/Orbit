// Service Worker — network-first for JS/CSS/HTML, cache-first for images
// Bump CACHE version on every deploy so users always get fresh code.
const CACHE = 'orbit-v1.16.0';

const SHELL = [
  './',
  './index.html',
  './assets/style.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/supabase.js',
  './js/auth.js',
  './js/config.js',
  './js/leveling.js',
  './js/engine.js',
  './js/defaultTasks.js',
  './js/utils.js',
  './js/pages/home.js',
  './js/pages/goals.js',
  './js/pages/review.js',
  './js/pages/profile.js',
  './js/pages/personalSpace.js',
  './js/pages/settings.js',
  './js/platform/storageBridge.js',
  './js/platform/notifications.js',
  './js/platform/haptics.js',
  './js/platform/share.js',
  './js/platform/purchases.js',
  './js/personalSpace/index.js',
  './js/personalSpace/sceneRuntime.js',
  './js/personalSpace/economy.js',
  './js/personalSpace/unlockRules.js',
  './js/personalSpace/gameState.js',
  './js/personalSpace/assetRegistry.js',
  './js/personalSpace/interactionBus.js',
  './js/personalSpace/avatar/avatarController.js',
  './js/personalSpace/avatar/animationController.js',
  './js/personalSpace/avatar/movementController.js',
  './js/personalSpace/npc/aiCompanionController.js',
  './js/personalSpace/npc/behaviorPlanner.js',
  './js/personalSpace/world/roomScene.js',
  './js/personalSpace/world/officeScene.js',
  './js/personalSpace/world/furnitureAnchors.js',
  './js/personalSpace/ui/shopPanel.js',
  './js/personalSpace/ui/dialogBubble.js',
  './js/personalSpace/ui/hudOverlay.js',
];

// Precache on install
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

// Delete old caches on activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   JS / CSS / HTML  → network-first (always try fresh, fall back to cache)
//   Images / fonts   → cache-first  (rarely change, save bandwidth)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isAsset = /\.(js|css|html)$/.test(url.pathname) || url.pathname === '/';

  if (isAsset) {
    // Network-first: get fresh code, update cache, fall back to cache if offline
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first: images, icons, manifests
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
