// Proof-photo capture sheet and fullscreen lightbox. Moved verbatim from app.js.
// proofCapture.js stays a lazy import so it never enters the startup critical path.

import { showToast } from './feedback.js';

export function showProofLightbox(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:600',
    'background:rgba(0,0,0,0.88)',
    'display:flex;align-items:center;justify-content:center',
    'animation:proFadeIn 0.18s ease',
    'cursor:zoom-out',
  ].join(';');
  const img = document.createElement('img');
  img.src = src;
  img.alt = '佐證';
  img.style.cssText = 'max-width:92vw;max-height:88vh;border-radius:10px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.6)';
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => {
    overlay.style.animation = 'proFadeOut 0.18s ease forwards';
    setTimeout(() => overlay.remove(), 200);
  });
}
window._showProofLightbox = showProofLightbox;

export async function showProofSheet(sessionId, taskName) {
  let compressImage;
  try {
    ({ compressImage } = await import('../platform/proofCapture.js'));
  } catch {
    // Proof capture is optional — silently skip rather than block the user
    return;
  }
  let selectedDataUrl = null;
  const overlay = document.createElement('div');
  overlay.className = 'pro-sheet-overlay';
  const sheet = document.createElement('div');
  sheet.className = 'pro-sheet';
  // Liquid Glass theme overrides position:fixed → relative via class selector;
  // inline style wins over any class-based rule to keep the sheet anchored at bottom.
  sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:500;';
  sheet.innerHTML = `
    <div class="pro-sheet-handle"></div>
    <div style="font-weight:600;font-size:16px;margin-bottom:4px">📸 附上佐證（選填）</div>
    <div id="proof-task-name" style="font-size:13px;color:var(--text-secondary);margin-bottom:16px"></div>
    <label style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;cursor:pointer" class="btn btn-outline">
      <span>選擇 / 拍攝照片</span>
      <input type="file" accept="image/*" capture="environment" style="display:none" id="proof-file-input">
    </label>
    <div id="proof-preview" style="display:none;text-align:center;margin-bottom:12px">
      <img id="proof-img" style="max-width:100%;max-height:200px;border-radius:8px;object-fit:contain" alt="佐證預覽">
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-outline" id="proof-skip" style="flex:1">跳過</button>
      <button class="btn btn-primary" id="proof-confirm" style="flex:1" disabled>確認</button>
    </div>
  `;
  sheet.querySelector('#proof-task-name').textContent = taskName;
  document.body.append(overlay, sheet);

  function close() {
    overlay.classList.add('pro-sheet-overlay-out');
    sheet.classList.add('pro-sheet-out');
    setTimeout(() => { overlay.remove(); sheet.remove(); }, 300);
  }

  overlay.addEventListener('click', close);
  sheet.querySelector('#proof-skip').addEventListener('click', close);
  sheet.querySelector('#proof-file-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      selectedDataUrl = await compressImage(file);
      sheet.querySelector('#proof-img').src = selectedDataUrl;
      sheet.querySelector('#proof-preview').style.display = 'block';
      sheet.querySelector('#proof-confirm').disabled = false;
    } catch { showToast('圖片處理失敗'); }
  });
  sheet.querySelector('#proof-confirm').addEventListener('click', () => {
    if (!selectedDataUrl) return;
    localStorage.setItem(`orbit_proof_${sessionId}`, selectedDataUrl);
    // Inject thumbnail directly into the existing log-item row so it
    // survives the close animation without a full-page re-render.
    const delBtn = document.querySelector(`.session-del-btn[data-session-id="${sessionId}"]`);
    if (delBtn) {
      const logItem = delBtn.closest('.log-item');
      if (logItem && !logItem.querySelector('.session-proof-thumb-wrap')) {
        const wrap = document.createElement('span');
        wrap.className = 'session-proof-thumb-wrap';
        const img = document.createElement('img');
        img.className = 'session-proof-thumb';
        img.src = selectedDataUrl;
        img.alt = '佐證';
        wrap.appendChild(img);
        const xpSpan = logItem.querySelector('.log-xp');
        if (xpSpan) xpSpan.before(wrap);
      }
    }
    close();
    showToast('佐證已儲存');
  });
}
