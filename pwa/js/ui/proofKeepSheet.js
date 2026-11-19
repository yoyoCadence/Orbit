// HW-112D (a): the photos BUG-118's "check sync" cannot confirm as uploaded,
// shown together so each can be saved by hand (long-press) before the old icon
// goes. Older ones are out of the free 30-day history, so the list is here.
// Built with DOM nodes (task names are the user's text). INFRA-105: a module of
// its own, importing only existing exports.

import { getProof } from '../platform/proofStore.js';

function dayLabel(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  return match ? `${match[1]}/${Number(match[2])}/${Number(match[3])}` : '';
}

function localProof(sessionId) {
  try {
    return getProof(sessionId);
  } catch {
    return null;
  }
}

let closeOpenSheet = null;

/**
 * @param {{ sessionId: string, date?: string, taskName?: string }[]} items
 * @param {{ returnFocus?: HTMLElement | null }} [options]
 * @returns {HTMLElement} the overlay (already in the page)
 */
export function showProofKeepSheet(items, { returnFocus = null } = {}) {
  closeOpenSheet?.({ restoreFocus: false });

  // .proof-lightbox: the Orbit Window pauses under full-screen overlays (PS-249A).
  const overlay = document.createElement('div');
  overlay.className = 'proof-lightbox proof-keep-sheet';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'proof-keep-title');

  const panel = document.createElement('div');
  panel.className = 'proof-keep-panel';

  const head = document.createElement('div');
  head.className = 'proof-keep-head';
  const title = document.createElement('h2');
  title.id = 'proof-keep-title';
  title.textContent = '無法確認已上傳的佐證照片';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'proof-keep-close';
  close.textContent = '完成';
  head.append(title, close);

  const hint = document.createElement('p');
  hint.className = 'proof-keep-hint';
  // Only these photos are here: other data may still be waiting (the check
  // result says so), so removing the old icon waits for a clean check.
  hint.textContent = '長按照片就能存到手機相簿或分享。要保留的照片存好後，再按一次「檢查同步」：其他資料也都同步了，才移除舊圖示。';

  const list = document.createElement('ul');
  list.className = 'proof-keep-list';
  for (const item of Array.isArray(items) ? items : []) {
    const src = localProof(item?.sessionId);
    if (!src) continue;
    const taskName = String(item.taskName || '這筆任務');
    const entry = document.createElement('li');
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = src;
    img.alt = `「${taskName}」佐證照片`;
    img.loading = 'lazy';
    img.decoding = 'async';
    const caption = document.createElement('figcaption');
    caption.textContent = [dayLabel(item.date), taskName].filter(Boolean).join(' ');
    figure.append(img, caption);
    entry.append(figure);
    list.append(entry);
  }

  panel.append(head, hint, list);
  overlay.append(panel);

  function onKey(event) {
    if (event.key === 'Escape') dismiss();
  }
  function dismiss({ restoreFocus = true } = {}) {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (closeOpenSheet === dismiss) closeOpenSheet = null;
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  }
  closeOpenSheet = dismiss;
  close.addEventListener('click', () => dismiss());
  overlay.addEventListener('click', event => {
      if (event.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKey);

  document.body.append(overlay);
  close.focus();
  return overlay;
}
