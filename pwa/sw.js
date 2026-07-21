// Service Worker
// Bump CACHE version on every deploy so users always get fresh code.
const CACHE = 'orbit-v1.21.2';

const SHELL = [
  './',
  './index.html',
  './assets/style.css',
  './js/app.js',
  './js/version.js',
  './js/flags.js',
  './js/state.js',
  './js/storage.js',
  './js/supabase.js',
  './js/auth.js',
  './js/config.js',
  './js/leveling.js',
  './js/titleBreathing.js',
  './js/engine.js',
  './js/defaultTasks.js',
  './js/utils.js',
  './js/timeBand.js',
  './js/theme.js',
  './js/router.js',
  './js/dayCycle.js',
  './js/sessionFlow.js',
  './js/focusTimer.js',
  './js/authFlow.js',
  './js/tour.js',
  './js/pages/home.js',
  './js/pages/goals.js',
  './js/pages/review.js',
  './js/pages/profile.js',
  './js/pages/personalSpace.js',
  './js/pages/settings.js',
  './js/pages/leaderboard.js',
  './js/ui/feedback.js',
  './js/ui/header.js',
  './js/ui/proNav.js',
  './js/ui/proofSheet.js',
  './js/ui/sessionRow.js',
  './js/platform/storageBridge.js',
  './js/platform/authOperationGuard.js',
  './js/platform/notifications.js',
  './js/platform/haptics.js',
  './js/platform/badge.js',
  './js/platform/proofCapture.js',
  './js/platform/proofStore.js',
  './js/platform/sessionDeletionLog.js',
  './js/platform/share.js',
  './js/platform/purchases.js',
  './js/personalSpace/index.js',
  './js/personalSpace/sceneRuntime.js',
  './js/personalSpace/economy.js',
  './js/personalSpace/unlockRules.js',
  './js/personalSpace/gameState.js',
  './js/personalSpace/idleWindow/index.js',
  './js/personalSpace/idleWindow/assetRegistry.js',
  './js/personalSpace/idleWindow/layouts.js',
  './js/personalSpace/idleWindow/renderer.js',
  './js/personalSpace/idleWindow/editorRuntime.js',
  './js/personalSpace/idleWindow/variantReadiness.js',
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
  './js/personalSpace/v2/config.js',
  './js/personalSpace/v2/featureFlag.js',
  './js/personalSpace/v2/stateSchema.js',
  './js/personalSpace/v2/migrateState.js',
  './js/personalSpace/v2/store.js',
  './js/personalSpace/v2/controller.js',
  './js/personalSpace/v2/sessionAdapter.js',
  './js/personalSpace/v2/rewardRules.js',
  './js/personalSpace/v2/rewardLedger.js',
  './js/personalSpace/v2/reconciler.js',
  './js/personalSpace/v2/projectEngine.js',
  './js/personalSpace/v2/questEngine.js',
  './js/personalSpace/v2/momentum.js',
  './js/personalSpace/v2/revealSelectors.js',
  './js/personalSpace/v2/companionEngine.js',
  './js/personalSpace/v2/viewModels.js',
  './js/personalSpace/v2/telemetry.js',
  './js/personalSpace/v2/content/assetManifest.js',
  './js/personalSpace/v2/runtime/pixiSceneRuntime.js',
  './js/personalSpace/v2/ui/orbitWindow.js',
  './js/pages/personalSpaceV2.js',
  './assets/personal-space/idle-window/backgrounds/office-angle-center-v2.png',
  './assets/personal-space/idle-window/characters/building-protagonist-idle/building-protagonist-idle-1.png',
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
//   HTML             → network-first  (entry point must always be fresh so SW updates are detected)
//   JS / CSS         → stale-while-revalidate (serve cache instantly; fetch in background for next load)
//   Images / others  → cache-first   (rarely change, save bandwidth)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isHtml   = url.pathname.endsWith('.html') || url.pathname === '/';
  const isJsCss  = /\.(js|css)$/.test(url.pathname);

  if (isHtml) {
    // Network-first: always fetch fresh HTML so the browser detects a new SW
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
  } else if (isJsCss) {
    // Stale-while-revalidate: return cached copy immediately; update cache in background
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const networkFetch = fetch(e.request)
            .then(res => { cache.put(e.request, res.clone()); return res; })
            .catch(() => null);
          return cached ?? networkFetch;
        })
      )
    );
  } else {
    // Cache-first: images, icons, manifests
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(response => {
            if (!response.ok) return response;
            return cache.put(e.request, response.clone()).then(
              () => response,
              () => response
            );
          });
        })
      )
    );
  }
});
