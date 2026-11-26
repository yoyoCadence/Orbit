// Shared session row renderer for the 今日紀錄 (home) and 完成紀錄 (goals) lists.
// Page differences are opt-in flags so both keep their existing markup:
//   home  → { showDelete: true, emptyXpText: '完成' }
//   goals → { showNote: true, showResultLabel: true }

import { escHtml, formatTime } from '../utils.js';
import {
  clearAchievementPhotoSelection,
  getAchievementPhotoSelection,
  getProof,
  setAchievementPhotoSelection,
} from '../platform/proofStore.js';
import { cloudProofUrl, observeCloudProofs, wantsCloudProof } from '../platform/proofCloud.js';

export const RESULT_ICON  = { complete: '✅', partial: '🔶', invalid: '❌', instant: '✓' };
export const RESULT_LABEL = { complete: '完成', partial: '部分完成', invalid: '無效', instant: '完成' };

export function sessionRowHtml(s, {
  showDelete = false,
  showNote = false,
  showResultLabel = false,
  emptyXpText = '',
  proofWallOwnerId = null,
} = {}) {
  const icon  = RESULT_ICON[s.result] || '✓';
  const xpStr = s.finalXP > 0
    ? `+${s.finalXP} XP`
    : s.energyGain > 0
      ? `+${s.energyGain} ⚡`
      : s.result === 'invalid' ? '0 XP' : emptyXpText;
  const dur         = s.durationMinutes > 0 ? ` · ${s.durationMinutes}m` : '';
  const resultLabel = showResultLabel ? ` · ${RESULT_LABEL[s.result] || ''}` : '';
  const thumbHtml = proofControlsHtml(s.id, {
    ownerId: proofWallOwnerId,
    taskName: s.taskName,
  });
  const noteHtml = (showNote && s.note) ? `<div class="log-note">💬 ${escHtml(s.note)}</div>` : '';

  return `
    <div class="log-item">
      <span class="log-result-icon">${icon}</span>
      <div class="log-info">
        <div class="log-name">${escHtml(s.taskName)}</div>
        <div class="log-time">${formatTime(s.completedAt)}${dur}${resultLabel}</div>
        ${noteHtml}
      </div>
      ${thumbHtml}
      <span class="log-xp ${s.result === 'invalid' ? 'log-xp-invalid' : ''}">${xpStr}</span>
      ${showDelete ? `<button class="session-del-btn" data-session-id="${s.id}" title="撤銷">✕</button>` : ''}
    </div>
  `;
}

// `ownerId` is the signed-in (or guest) account the row belongs to: it keys the
// Personal Space selection and, signed in, the cloud copy (HW-112C2a). Without
// a photo on this device, a signed-in row gets a hidden placeholder that
// bindProofThumbs() fills once the cloud photo arrives (rows with no photo stay
// as they are).
export function proofControlsHtml(sessionId, { ownerId = null, taskName = '' } = {}) {
  const safeTaskName = escHtml(taskName || '這筆任務');
  const proof = getProof(sessionId) || cloudProofUrl(ownerId, sessionId);
  if (!proof) {
    // Even during a recent "not found": the placeholder is how the row gets
    // looked at again once that runs out.
    return wantsCloudProof(ownerId, sessionId, { evenIfMissed: true })
      ? `<span class="session-proof-cloud" data-proof-cloud-session-id="${escHtml(sessionId)}" data-proof-cloud-task-name="${escHtml(taskName || '')}" hidden></span>`
      : '';
  }

  const selected = getAchievementPhotoSelection(ownerId) === String(sessionId);
  const wallButton = ownerId ? `
    <button
      class="session-proof-wall-btn ${selected ? 'is-selected' : ''}"
      type="button"
      data-proof-wall-session-id="${escHtml(sessionId)}"
      data-proof-wall-task-name="${safeTaskName}"
      aria-label="${selected ? '取消在個人空間展示' : '在個人空間展示'}「${safeTaskName}」佐證"
      aria-pressed="${selected}"
      title="${selected ? '取消展示' : '展示到個人空間'}"
    >${selected ? '✓' : '🖼'}</button>
  ` : '';

  return `
    <span class="session-proof-thumb-wrap">
      <button class="session-proof-preview-btn" type="button" aria-label="檢視「${safeTaskName}」佐證照片">
        <img class="session-proof-thumb" src="${escHtml(proof)}" alt="">
      </button>
      ${wallButton}
    </span>
  `;
}

/**
 * Bind proof preview and local Personal Space photo-wall selection controls,
 * and fill in cloud photos as their rows come into view.
 */
export function bindProofThumbs(container, { ownerId = null, onPhotoWallChange } = {}) {
  bindProofControls(container, container, { ownerId, onPhotoWallChange });
  // BUG-124: a photo the proof sheet (ui/proofSheet.js) puts into a row is
  // taken in like the list's own, so its Personal Space switch updates the
  // whole list and runs this page's handler. One listener per container (a
  // page renders into the same one again); the latest render's options win.
  const previous = PROOF_ADDED_LISTENERS.get(container);
  if (previous) container.removeEventListener(PROOF_ADDED_EVENT, previous);
  const onProofAdded = event => {
    const wrap = event.target;
    if (event.defaultPrevented || !wrap?.classList?.contains('session-proof-thumb-wrap')) return;
    event.preventDefault();
    bindProofControls(wrap, container, { ownerId, onPhotoWallChange });
  };
  PROOF_ADDED_LISTENERS.set(container, onProofAdded);
  container.addEventListener(PROOF_ADDED_EVENT, onProofAdded);
  observeCloudProofs(container, ownerId, sentinel => {
    const shell = document.createElement('div');
    shell.innerHTML = proofControlsHtml(sentinel.dataset.proofCloudSessionId, {
      ownerId,
      taskName: sentinel.dataset.proofCloudTaskName,
    });
    const wrap = shell.querySelector('.session-proof-thumb-wrap');
    if (!wrap) return;
    sentinel.replaceWith(wrap);
    bindProofControls(wrap, container, { ownerId, onPhotoWallChange });
  });
}

// The event ui/proofSheet.js sends from a thumbnail it inserted (BUG-124).
const PROOF_ADDED_EVENT = 'orbit:proof-added';
const PROOF_ADDED_LISTENERS = new WeakMap();

// Binds the controls inside `target`; a selection change updates every
// photo-wall button in `scope` (the whole list).
function bindProofControls(target, scope, { ownerId = null, onPhotoWallChange } = {}) {
  target.querySelectorAll('.session-proof-preview-btn').forEach(button => {
    button.addEventListener('click', e => {
      e.stopPropagation();
      const img = button.querySelector('.session-proof-thumb');
      if (img?.src) window._showProofLightbox?.(img.src);
    });
  });

  target.querySelectorAll('.session-proof-wall-btn').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const sessionId = button.dataset.proofWallSessionId;
      const taskName = button.dataset.proofWallTaskName || '這筆任務';
      const selected = getAchievementPhotoSelection(ownerId) === sessionId;
      try {
        if (selected) clearAchievementPhotoSelection(ownerId);
        else setAchievementPhotoSelection(ownerId, sessionId);
      } catch (error) {
        onPhotoWallChange?.({ error, ownerId, sessionId, selected: false, taskName });
        return;
      }

      const nextSelection = getAchievementPhotoSelection(ownerId);
      scope.querySelectorAll('.session-proof-wall-btn').forEach(candidate => {
        const isSelected = candidate.dataset.proofWallSessionId === nextSelection;
        const candidateTask = candidate.dataset.proofWallTaskName || '這筆任務';
        candidate.classList.toggle('is-selected', isSelected);
        candidate.setAttribute('aria-pressed', String(isSelected));
        candidate.setAttribute(
          'aria-label',
          `${isSelected ? '取消在個人空間展示' : '在個人空間展示'}「${candidateTask}」佐證`,
        );
        candidate.title = isSelected ? '取消展示' : '展示到個人空間';
        candidate.textContent = isSelected ? '✓' : '🖼';
      });
      onPhotoWallChange?.({
        ownerId,
        sessionId,
        selected: nextSelection === sessionId,
        taskName,
      });
    });
  });
}
