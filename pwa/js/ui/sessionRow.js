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

export function proofControlsHtml(sessionId, { ownerId = null, taskName = '' } = {}) {
  const proof = getProof(sessionId);
  if (!proof) return '';

  const selected = getAchievementPhotoSelection(ownerId) === String(sessionId);
  const safeTaskName = escHtml(taskName || '這筆任務');
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

/** Bind proof preview and local Personal Space photo-wall selection controls. */
export function bindProofThumbs(container, { ownerId = null, onPhotoWallChange } = {}) {
  container.querySelectorAll('.session-proof-preview-btn').forEach(button => {
    button.addEventListener('click', e => {
      e.stopPropagation();
      const img = button.querySelector('.session-proof-thumb');
      if (img?.src) window._showProofLightbox?.(img.src);
    });
  });

  container.querySelectorAll('.session-proof-wall-btn').forEach(button => {
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
      container.querySelectorAll('.session-proof-wall-btn').forEach(candidate => {
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
