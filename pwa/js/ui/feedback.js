// Lightweight user-feedback widgets: toast, XP float, sync banner, level-up overlay.
// Pure DOM helpers — no app state; safe to import from anywhere.

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ─── XP float animation ──────────────────────────────────────────────────────

export function showXPFloat(text) {
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ─── Sync banner ─────────────────────────────────────────────────────────────

let _syncHideTimer = null;

export function showSyncBanner(status) {
  const el = document.getElementById('sync-banner');
  if (!el) return;
  clearTimeout(_syncHideTimer);
  if (status === 'syncing') {
    el.className = 'syncing';
    el.textContent = '☁️ 同步中…';
  } else {
    el.className = 'synced';
    el.textContent = '✓ 已更新';
    _syncHideTimer = setTimeout(() => {
      el.className = 'hidden';
    }, 2000);
  }
}

// ─── Level-up overlay ────────────────────────────────────────────────────────

export function showLevelUp(level, title) {
  document.getElementById('lu-level').textContent = level;
  document.getElementById('lu-title').textContent = title;
  document.getElementById('levelup-overlay').classList.remove('hidden');
}

window.closeLevelUp = function () {
  document.getElementById('levelup-overlay').classList.add('hidden');
};
