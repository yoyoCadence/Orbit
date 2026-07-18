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
// settings.js 與 export.js 以 window.showToast 呼叫（共 13 處）——必須綁定，
// 否則同步按鈕成功後會拋 TypeError 卡在「同步中…」。
window.showToast = showToast;

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
  } else if (status === 'error') {
    el.className = 'sync-error';
    el.textContent = '⚠️ 同步暫停，將於下次連線重試';
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
