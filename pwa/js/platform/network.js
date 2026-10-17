// Connectivity adapter (HW-110).
// PWA: navigator.onLine plus window online/offline events. A hybrid shell would
// swap this for its native reachability API (see docs/platform-adapters.md).
// `navigator.onLine === false` reliably means offline; `true` only means the
// device has a network, so callers still treat a failed sync as "pending".

export function isOnline() {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}

/**
 * Calls `handler(isOnline)` whenever connectivity changes.
 * @returns {() => void} unsubscribe
 */
export function onConnectivityChange(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return () => {};
  const onOnline = () => handler(true);
  const onOffline = () => handler(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
