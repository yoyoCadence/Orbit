export function isNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission() {
  if (!isNotificationsSupported()) return 'unsupported';
  return window.Notification.requestPermission();
}

export async function sendPlatformNotification({ title, body } = {}) {
  if (!isNotificationsSupported()) return { delivered: false, reason: 'unsupported' };

  if (window.Notification.permission !== 'granted') {
    return { delivered: false, reason: 'permission-denied' };
  }

  new window.Notification(title || 'Orbit', { body: body || '' });
  return { delivered: true, reason: 'web-notification' };
}
