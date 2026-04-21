const PREFIX = 'orbit_platform_bridge_v1';

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeValue(key) {
  try {
    localStorage.removeItem(`${PREFIX}:${key}`);
    return true;
  } catch {
    return false;
  }
}

export function getStorageBridgeInfo() {
  return {
    platform: 'web',
    persistence: 'localStorage',
    namespace: PREFIX,
  };
}
