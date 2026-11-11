// BUG-118: a home-screen icon added before v1.41.14 still opens with the old
// black-translucent status bar, so iOS 26.1+ keeps blurring the top of the app.
//
// iOS stores the status-bar style with the icon when it is added (BUG-117 set
// `default` in index.html). An update changes the page, not the stored style,
// and no CSS or script can change it (other projects found the same; a band
// pushed below the status bar only added an empty strip). Some reports say a
// full relaunch after the update picks up the new style, others that only
// re-adding the icon does. So the app finds out on the device:
//   1. still translucent → ask for a full relaunch (again after an in-app
//      reload, until that banner is closed);
//   2. still translucent on a later launch → explain how to re-add the icon,
//      with what happens to the data, on every launch until the banner is
//      closed;
//   3. no longer translucent → forget everything.
//
// "Translucent" is read from the top safe area: under `default` the app starts
// below an opaque status bar and the inset is 0 (js/appHeight.js). Landscape
// says nothing (the inset is 0 there either way).
//
// INFRA-105: a new module; app.js imports only from it.

export const STATUS_BAR_NOTICE_KEY = 'orbit_status_bar_notice';

/**
 * Decide what this page load shows and what to remember.
 *
 * @param {{
 *   iosHomeScreen: boolean,     // navigator.standalone === true
 *   safeTop: number,            // top safe-area inset in CSS px
 *   portrait: boolean,
 *   navigationType: string,     // performance navigation entry type
 *   saved: null | { relaunchAskedAtMs?: number, relaunchDismissedAtMs?: number,
 *                   readdDismissedAtMs?: number },
 *   nowMs: number,
 * }} input
 * @returns {{ step: 'none' | 'relaunch' | 'readd', next: object | null }}
 *   `next` is the state to store; `null` means remove it.
 */
export function statusBarNoticeStep({ iosHomeScreen, safeTop, portrait, navigationType, saved, nowMs }) {
  const state = saved && typeof saved === 'object' ? saved : null;
  if (!iosHomeScreen || !portrait) return { step: 'none', next: state };
  if (!(safeTop > 0)) return { step: 'none', next: null };

  if (!Number.isFinite(state?.relaunchAskedAtMs)) {
    return { step: 'relaunch', next: { relaunchAskedAtMs: nowMs } };
  }
  // A reload inside the app (the update banner, pull to refresh) is not a
  // launch: iOS applies the stored style only when the app starts.
  if (navigationType === 'reload') {
    return { step: Number.isFinite(state.relaunchDismissedAtMs) ? 'none' : 'relaunch', next: state };
  }
  return { step: Number.isFinite(state.readdDismissedAtMs) ? 'none' : 'readd', next: state };
}

/** The state after the banner for `step` is closed. */
export function dismissStatusBarNotice(state, step, nowMs) {
  const base = state && typeof state === 'object' ? state : { relaunchAskedAtMs: nowMs };
  if (step === 'relaunch') return { ...base, relaunchDismissedAtMs: nowMs };
  if (step === 'readd') return { ...base, readdDismissedAtMs: nowMs };
  return base;
}

/** The stored state, or null when it is missing or unreadable. */
export function readStatusBarNoticeState(storage) {
  try {
    const raw = storage.getItem(STATUS_BAR_NOTICE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** Store `next` (or remove the key for null). Storage errors are ignored. */
export function writeStatusBarNoticeState(storage, next) {
  try {
    if (next === null) storage.removeItem(STATUS_BAR_NOTICE_KEY);
    else storage.setItem(STATUS_BAR_NOTICE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the notice may show again, nothing breaks.
  }
}

/**
 * The banner text for a step, as plain strings (the caller sets textContent).
 *
 * @param {'relaunch' | 'readd'} step
 * @param {{ signedIn: boolean, pendingSync: number }} account
 * @returns {{ title: string, body: string[] }}
 */
export function statusBarNoticeText(step, { signedIn, pendingSync }) {
  if (step === 'relaunch') {
    return {
      title: '頂部模糊的修正需要重新開啟 Orbit',
      body: [
        '請把 Orbit 完全關閉再打開：從螢幕底部往上滑並停住，把 Orbit 的畫面往上滑掉，再從主畫面打開。',
      ],
    };
  }
  let data;
  if (!signedIn) {
    data = '注意：訪客模式的資料只存在這個主畫面 app 裡，刪除圖示會一起刪掉。要保留這些資料，就先不要刪除圖示（頂部的模糊不影響使用）。';
  } else if (pendingSync > 0) {
    data = `還有 ${pendingSync} 筆資料等待同步。請先連上網路，等同步完成再刪除圖示。`;
  } else {
    data = '你的資料都已同步，重新加入後用同一個帳號登入即可。';
  }
  return {
    title: '這個主畫面圖示要重新加入一次',
    body: [
      '這個圖示是在修正之前加入的，iOS 會一直沿用當時的狀態列設定，所以頂部仍會模糊，更新 app 也改不了。',
      '修正方式：長按主畫面上的 Orbit →「移除 App」→「刪除 App」；再用 Safari 打開 Orbit，點「分享」→「加入主畫面」。',
      data,
    ],
  };
}
