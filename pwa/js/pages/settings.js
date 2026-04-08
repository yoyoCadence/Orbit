import { state } from '../state.js';
import { storage } from '../storage.js';
import { applyTheme, applyBgImage, removeBgImage } from '../app.js';
import { uid } from '../utils.js';

// ── Theme definitions ────────────────────────────────────────────
export const THEMES = [
  { id: 'dark-purple', name: '暗夜紫', icon: '🌌', colors: ['#7c3aed', '#f59e0b', '#0d0d1a'] },
  { id: 'aurora-blue', name: '極光藍', icon: '🌊', colors: ['#0ea5e9', '#06d6a0', '#050d1a'] },
  { id: 'emerald',     name: '翡翠綠', icon: '🌿', colors: ['#16a34a', '#fbbf24', '#080f0a'] },
  { id: 'flame',       name: '赤　焰', icon: '🔥', colors: ['#ea580c', '#fde047', '#120a05'] },
  { id: 'neon-pink',   name: '霓虹粉', icon: '💜', colors: ['#db2777', '#a855f7', '#12040f'] },
  { id: 'light',       name: '純白光', icon: '☀️', colors: ['#7c3aed', '#d97706', '#f1f5f9'] },
];

const EMOJI_LIST = [
  '🏃','🚶','🏋️','🧘','🚴','🏊','⚽','🏸','🎯','📚','💡','🎨','🎵','🎮',
  '🍎','🥗','🥤','💧','💊','🌙','😴','✍️','📝','💻','🤝','❤️','🧠','🌟',
  '⭐','🔥','💪','🦋','🌱','🏆','💎','🚀','🎓','📖','🖊️','⏰','🎸','🎹',
];

// ── Main render ──────────────────────────────────────────────────
export function renderSettings(container) {
  renderView(container);
}

function renderView(container) {
  const currentTheme = storage.getTheme();
  const hasBg = !!storage.getBgImage();

  const themeGrid = THEMES.map(t => `
    <div class="theme-card ${t.id === currentTheme ? 'active' : ''}" data-theme-id="${t.id}">
      <div class="theme-preview">
        <div class="tp-bg" style="background:${t.colors[2]}">
          <div class="tp-surface">
            <div class="tp-primary" style="background:${t.colors[0]}"></div>
            <div class="tp-accent"  style="background:${t.colors[1]}"></div>
          </div>
        </div>
      </div>
      <div class="theme-name">${t.icon} ${t.name}</div>
      ${t.id === currentTheme ? '<div class="theme-check">✓</div>' : ''}
    </div>
  `).join('');

  const goalsHtml = state.goals.length
    ? state.goals.map(g => `
        <div class="log-item">
          ${g.iconImg
            ? `<img src="${g.iconImg}" class="log-icon-img">`
            : `<span class="log-emoji">${g.emoji}</span>`}
          <div class="log-info">
            <div class="log-name">${escHtml(g.name)}</div>
            <div class="log-time">${g.xp} XP / 次</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-outline btn-sm" data-edit="${g.id}">編輯</button>
            <button class="btn-danger-sm" data-del="${g.id}">刪除</button>
          </div>
        </div>
      `).join('')
    : `<div class="empty-state"><div class="empty-icon">🎯</div><p>還沒有任何目標</p></div>`;

  container.innerHTML = `
    <div class="section-title">⚙️ 設定</div>

    <!-- Theme -->
    <div class="card">
      <div class="card-title">🎨 App 主題</div>
      <div class="theme-grid">${themeGrid}</div>
    </div>

    <!-- Background -->
    <div class="card">
      <div class="card-title">🖼️ 背景圖片</div>
      <div class="bg-preview-row">
        <div class="bg-thumb" id="bg-thumb">
          ${hasBg ? `<img src="${storage.getBgImage()}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : '<span style="font-size:28px">🏔️</span>'}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex:1">
          <button class="btn btn-outline btn-sm" id="bg-upload-btn">上傳圖片</button>
          ${hasBg ? `<button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.3)" id="bg-clear-btn">移除背景</button>` : ''}
        </div>
      </div>
      <input type="file" id="bg-input" accept="image/*" style="display:none">
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px">啟用背景圖後，介面自動套用玻璃模糊效果</div>
    </div>

    <!-- Goals -->
    <div class="card">
      <div class="card-title">🎯 目標管理</div>
      <div id="goals-list">${goalsHtml}</div>
      <button class="btn btn-primary" style="margin-top:12px" id="add-goal-btn">+ 新增目標</button>
    </div>

    <!-- Future account -->
    <div class="card future-card">
      <div class="card-title">🔒 帳號系統（即將推出）</div>
      <div class="future-list">
        <div>☁️ 雲端帳號同步</div>
        <div>📱 跨裝置資料共享</div>
        <div>🏆 社群排行榜</div>
        <div>💾 備份與還原</div>
      </div>
    </div>

    <!-- Danger -->
    <div class="card">
      <div class="card-title" style="color:var(--danger)">危險操作</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">清除後無法復原</p>
      <button class="btn btn-sm" style="background:var(--danger);color:white" id="reset-btn">清除所有資料</button>
    </div>
  `;

  setupListeners(container);
}

function setupListeners(container) {
  // Theme selection
  container.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.themeId;
      applyTheme(id);
      renderView(container);
    });
  });

  // Background upload
  container.querySelector('#bg-upload-btn').addEventListener('click', () => {
    container.querySelector('#bg-input').click();
  });
  container.querySelector('#bg-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file, 900, 0.72);
    applyBgImage(compressed);
    renderView(container);
  });
  const bgClear = container.querySelector('#bg-clear-btn');
  if (bgClear) {
    bgClear.addEventListener('click', () => {
      removeBgImage();
      renderView(container);
    });
  }

  // Goal CRUD
  container.querySelector('#add-goal-btn').addEventListener('click', () => {
    showGoalModal(container, null);
  });
  container.querySelector('#goals-list').addEventListener('click', e => {
    const editId = e.target.dataset.edit;
    const delId  = e.target.dataset.del;
    if (editId) {
      const goal = state.goals.find(g => g.id === editId);
      if (goal) showGoalModal(container, goal);
    }
    if (delId) {
      if (!confirm('確定刪除此目標？')) return;
      state.goals = state.goals.filter(g => g.id !== delId);
      storage.saveGoals(state.goals);
      renderView(container);
    }
  });

  // Reset
  container.querySelector('#reset-btn').addEventListener('click', () => {
    if (!confirm('確定清除所有資料？此操作無法復原！')) return;
    storage.clearAll();
    location.reload();
  });
}

// ── Goal modal ───────────────────────────────────────────────────
function showGoalModal(container, goal) {
  const isEdit = !!goal;
  let selectedEmoji = goal?.emoji || '🎯';
  let selectedIconImg = goal?.iconImg || null; // custom image takes priority

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? '編輯目標' : '新增目標'}</span>
        <button class="modal-close" id="gm-close">✕</button>
      </div>

      <!-- Icon preview + upload -->
      <div class="form-group">
        <label class="form-label">目標圖示</label>
        <div class="icon-row">
          <div class="icon-preview" id="icon-preview">
            ${selectedIconImg
              ? `<img src="${selectedIconImg}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
              : selectedEmoji}
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-outline btn-sm" id="icon-upload-btn">📷 上傳自訂圖示</button>
            <button class="btn btn-outline btn-sm" id="icon-clear-btn" ${!selectedIconImg ? 'style="display:none"' : ''}>使用 Emoji 代替</button>
          </div>
          <input type="file" id="icon-input" accept="image/*" style="display:none">
        </div>
      </div>

      <!-- Emoji picker (hidden when image set) -->
      <div class="form-group" id="emoji-section" ${selectedIconImg ? 'style="display:none"' : ''}>
        <label class="form-label">或選擇 Emoji <span id="emoji-preview">${selectedEmoji}</span></label>
        <div class="emoji-picker">
          ${EMOJI_LIST.map(e => `
            <button class="emoji-option ${e === selectedEmoji ? 'selected' : ''}" data-emoji="${e}">${e}</button>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">目標名稱</label>
        <input class="form-input" id="gm-name" placeholder="例：晨跑 30 分鐘" maxlength="20" value="${escHtml(goal?.name || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">完成獎勵 XP（建議 50–300）</label>
        <input class="form-input" id="gm-xp" type="number" min="1" max="9999" value="${goal?.xp ?? 100}">
      </div>

      <button class="btn btn-primary" id="gm-save">${isEdit ? '儲存變更' : '新增目標'}</button>
    </div>
  `;
  document.body.appendChild(modal);

  const preview    = modal.querySelector('#icon-preview');
  const emojiSec   = modal.querySelector('#emoji-section');
  const clearBtn   = modal.querySelector('#icon-clear-btn');

  // Icon image upload
  modal.querySelector('#icon-upload-btn').addEventListener('click', () => {
    modal.querySelector('#icon-input').click();
  });
  modal.querySelector('#icon-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    selectedIconImg = await compressImage(file, 200, 0.82);
    preview.innerHTML = `<img src="${selectedIconImg}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    emojiSec.style.display = 'none';
    clearBtn.style.display = '';
  });
  modal.querySelector('#icon-clear-btn').addEventListener('click', () => {
    selectedIconImg = null;
    preview.textContent = selectedEmoji;
    emojiSec.style.display = '';
    clearBtn.style.display = 'none';
  });

  // Emoji selection
  modal.querySelectorAll('.emoji-option').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedEmoji = btn.dataset.emoji;
      modal.querySelector('#emoji-preview').textContent = selectedEmoji;
      if (!selectedIconImg) preview.textContent = selectedEmoji;
    });
  });

  // Close
  modal.querySelector('#gm-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => modal.querySelector('#gm-name').focus(), 80);

  // Save
  modal.querySelector('#gm-save').addEventListener('click', () => {
    const name = modal.querySelector('#gm-name').value.trim();
    const xp   = Math.max(1, parseInt(modal.querySelector('#gm-xp').value) || 100);
    if (!name) { modal.querySelector('#gm-name').focus(); return; }

    if (isEdit) {
      const g = state.goals.find(g => g.id === goal.id);
      if (g) { g.name = name; g.xp = xp; g.emoji = selectedEmoji; g.iconImg = selectedIconImg; }
    } else {
      state.goals.push({ id: uid(), name, xp, emoji: selectedEmoji, iconImg: selectedIconImg });
    }

    storage.saveGoals(state.goals);
    modal.remove();
    renderView(container);
  });
}

// ── Image compression ────────────────────────────────────────────
function compressImage(file, maxPx, quality) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const min = Math.min(img.width, img.height);
        const size = Math.min(min, maxPx);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const sx = (img.width  - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
