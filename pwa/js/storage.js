// Data persistence abstraction layer
// Swap LocalStorageProvider for an API provider later without changing callers

const PREFIX = 'yoyo_';

function get(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}
function set(key, val) {
  localStorage.setItem(PREFIX + key, JSON.stringify(val));
}

// Future: replace this object with a cloud provider
export const storage = {
  getUser:     ()  => get('user'),
  saveUser:    (u) => set('user', u),
  getGoals:    ()  => get('goals') ?? [],
  saveGoals:   (g) => set('goals', g),
  getLogs:     ()  => get('logs') ?? [],
  saveLogs:    (l) => set('logs', l),
  getTheme:    ()  => get('theme') || 'dark-purple',
  saveTheme:   (t) => set('theme', t),
  getBgImage:  ()  => localStorage.getItem(PREFIX + 'bgImage') || null, // raw base64, skip JSON
  saveBgImage: (d) => d
    ? localStorage.setItem(PREFIX + 'bgImage', d)
    : localStorage.removeItem(PREFIX + 'bgImage'),
  clearAll:    ()  => {
    ['user', 'goals', 'logs', 'theme', 'bgImage'].forEach(k => localStorage.removeItem(PREFIX + k));
  },
};
