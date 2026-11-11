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
//   2. still translucent on a later launch → explain how to add a new icon,
//      check it, and only then remove the old one (with what the old icon's
//      storage holds), on every launch and reload until the banner is closed;
//   3. not translucent → show nothing (the state is kept: a single reading of
//      0 must not undo what was closed).
// iPads are left out: BUG-117's opaque header does not span an iPad, so a new
// icon may not clear the blur there.
//
// "Translucent" is read from the top safe area: under `default` the app starts
// below an opaque status bar and the inset is 0 (js/appHeight.js; BUG-118A
// checks it on a device). Landscape says nothing (the inset is 0 there either
// way).
//
// INFRA-105: a new module; app.js imports only from it.

export const STATUS_BAR_NOTICE_KEY = 'orbit_status_bar_notice';

/** Wider than this is not a phone (BUG-117: the header column covers phones up to about 475px). */
export const STATUS_BAR_NOTICE_MAX_WIDTH = 475;

function isTime(value) {
  return Number.isFinite(value);
}

/**
 * Decide what this page load shows and what to remember.
 *
 * @param {{
 *   iosHomeScreen: boolean,     // navigator.standalone === true
 *   safeTop: number,            // top safe-area inset in CSS px
 *   portrait: boolean,
 *   viewportWidth: number,      // CSS px
 *   navigationType: string,     // performance navigation entry type
 *   saved: null | { relaunchAskedAtMs?: number, relaunchDismissedAtMs?: number,
 *                   readdShownAtMs?: number, readdDismissedAtMs?: number },
 *   nowMs: number,
 * }} input
 * @returns {{ step: 'none' | 'relaunch' | 'readd', next: object | null }}
 *   `next` is the state to store (null: nothing stored).
 */
export function statusBarNoticeStep({ iosHomeScreen, safeTop, portrait, viewportWidth, navigationType, saved, nowMs }) {
  const state = saved && typeof saved === 'object' ? saved : null;
  const none = { step: 'none', next: state };
  if (!iosHomeScreen || !portrait || !(viewportWidth <= STATUS_BAR_NOTICE_MAX_WIDTH)) return none;
  if (!(safeTop > 0)) return none;

  if (!isTime(state?.relaunchAskedAtMs)) {
    return { step: 'relaunch', next: { relaunchAskedAtMs: nowMs } };
  }
  // A reload inside the app (the update banner, pull to refresh) is not a
  // launch: iOS applies the stored style only when the app starts. It keeps
  // whichever step this icon has reached.
  if (navigationType === 'reload' && !isTime(state.readdShownAtMs)) {
    return isTime(state.relaunchDismissedAtMs) ? none : { step: 'relaunch', next: state };
  }
  if (isTime(state.readdDismissedAtMs)) return none;
  return { step: 'readd', next: isTime(state.readdShownAtMs) ? state : { ...state, readdShownAtMs: nowMs } };
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

/** Store `next` (nothing for null). Storage errors are ignored. */
export function writeStatusBarNoticeState(storage, next) {
  if (next === null) return;
  try {
    storage.setItem(STATUS_BAR_NOTICE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the notice may show again, nothing breaks.
  }
}

/**
 * The banner text for a step, as plain strings (the caller sets textContent).
 * Short on screen (title and one line); the steps sit behind 「怎麼做」.
 *
 * It never relies on a sync state that can change while the banner is up:
 * the user checks the new icon before removing the old one. Only the
 * account's profile, tasks and records are on the server; proof photos
 * (platform/proofStore.js), the background picture, theme, today's plan and
 * the Personal Space (docs/personal-space-state-flow.md §6) are in this app's
 * own storage, which removing the icon may delete.
 *
 * @param {'relaunch' | 'readd'} step
 * @param {{ signedIn: boolean, appUrl: string }} context
 * @returns {{ title: string, summary: string, steps: string[], warning: string }}
 */
export function statusBarNoticeText(step, { signedIn, appUrl }) {
  if (step === 'relaunch') {
    return {
      title: '頂部如果被模糊蓋住：請完全關閉 Orbit 再打開',
      summary: '從 App 切換器把 Orbit 往上滑掉（有 Home 鍵的 iPhone：按兩下 Home 鍵），再從主畫面打開。',
      steps: [],
      warning: '',
    };
  }
  const keep = '頂部的模糊不影響使用，要保留就先不要移除舊圖示。';
  return {
    title: '頂部如果還是被模糊蓋住：請重新加入主畫面',
    summary: '這個圖示是修正前加入的，iOS 會一直沿用當時的狀態列設定，更新 app 改不了。先加入新的圖示，確認正常後再移除這個舊的。',
    steps: [
      `用 Safari 打開 ${appUrl}；如果出現「新版本已就緒」，先點「重新整理」。`,
      '在 Safari 的分享選單（iOS 26 在網址列旁的「⋯」裡）選「加入主畫面」。',
      signedIn
        ? '打開新的圖示，用同一個帳號登入，確認頂部不再模糊、紀錄都在。'
        : '打開新的圖示，確認頂部不再模糊。',
      '最後長按舊的 Orbit 圖示，把它從主畫面移除。',
    ],
    warning: signedIn
      ? `注意：佐證照片、背景圖片、主題、今天的計畫與個人空間只存在這台裝置的舊圖示裡，移除舊圖示時可能一起被刪除。${keep}`
      : `注意：訪客模式的所有資料都只存在這台裝置的舊圖示裡，移除舊圖示時可能一起被刪除。${keep}`,
  };
}
