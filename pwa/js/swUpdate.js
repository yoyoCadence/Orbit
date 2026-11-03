// Registers the service worker and offers a reload when a new one takes over.
// An inline <script> in index.html until INFRA-113: the Content-Security-Policy
// allows no inline code. Loaded as its own module so it still runs when app.js
// fails to start.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});

  // Show update banner when a new SW takes control (skipWaiting → controllerchange).
  // prevController guard prevents banner on first install (controller was null).
  const prevController = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!prevController) return; // first-time install, not an update
    if (document.getElementById('update-banner')) return; // already shown
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.innerHTML =
      '<span>🆕 新版本已就緒</span>' +
      '<button type="button" class="update-banner-reload">重新整理</button>' +
      '<button type="button" class="update-banner-close">✕</button>';
    banner.querySelector('.update-banner-reload').addEventListener('click', () => location.reload());
    banner.querySelector('.update-banner-close').addEventListener('click', () => banner.remove());
    document.body.prepend(banner);
  });
}
