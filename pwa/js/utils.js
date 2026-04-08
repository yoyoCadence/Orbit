// Shared utility functions

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const todayStr = today();
  if (dateStr === todayStr) return '今天';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return '昨天';
  return d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
}
