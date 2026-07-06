// Shared session row renderer for the 今日紀錄 (home) and 完成紀錄 (goals) lists.
// Page differences are opt-in flags so both keep their existing markup:
//   home  → { showDelete: true, emptyXpText: '完成' }
//   goals → { showNote: true, showResultLabel: true }

import { escHtml, formatTime } from '../utils.js';

export const RESULT_ICON  = { complete: '✅', partial: '🔶', invalid: '❌', instant: '✓' };
export const RESULT_LABEL = { complete: '完成', partial: '部分完成', invalid: '無效', instant: '完成' };

export function sessionRowHtml(s, {
  showDelete = false,
  showNote = false,
  showResultLabel = false,
  emptyXpText = '',
} = {}) {
  const icon  = RESULT_ICON[s.result] || '✓';
  const xpStr = s.finalXP > 0
    ? `+${s.finalXP} XP`
    : s.energyGain > 0
      ? `+${s.energyGain} ⚡`
      : s.result === 'invalid' ? '0 XP' : emptyXpText;
  const dur         = s.durationMinutes > 0 ? ` · ${s.durationMinutes}m` : '';
  const resultLabel = showResultLabel ? ` · ${RESULT_LABEL[s.result] || ''}` : '';
  const proof = localStorage.getItem(`orbit_proof_${s.id}`);
  const thumbHtml = proof
    ? `<span class="session-proof-thumb-wrap"><img class="session-proof-thumb" src="${proof}" alt="佐證"></span>`
    : '';
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

/** Make proof thumbnails inside `container` open the fullscreen lightbox. */
export function bindProofThumbs(container) {
  container.querySelectorAll('.session-proof-thumb').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', e => {
      e.stopPropagation();
      window._showProofLightbox(img.src);
    });
  });
}
