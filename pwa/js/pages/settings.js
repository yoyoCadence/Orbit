import { state }                      from '../state.js';
import { storage }                     from '../storage.js';
import { applyTheme, applyBgImage, removeBgImage } from '../app.js';
import { uid }                         from '../utils.js';

// ── Theme definitions ────────────────────────────────────────────────────────
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

// Labels for select dropdowns
const NATURE_OPTIONS = [
  { v: 'growth',        l: '成長（growth）' },
  { v: 'maintenance',   l: '維持（maintenance）' },
  { v: 'obligation',    l: '必要（obligation）' },
  { v: 'recovery',      l: '恢復（recovery）' },
  { v: 'entertainment', l: '娛樂（entertainment）' },
];
const VALUE_OPTIONS = [
  { v: 'S', l: 'S — 明顯讓你變強' },
  { v: 'A', l: 'A — 有實質幫助' },
  { v: 'B', l: 'B — 維持運轉' },
  { v: 'D', l: 'D — 放鬆消遣' },
];
const DIFFICULTY_OPTIONS = [
  { v: '0.4', l: '低（5-15 分鐘，可立刻開始）' },
  { v: '0.7', l: '中（15-45 分鐘，需切換狀態）' },
  { v: '1.0', l: '高（45 分鐘以上，需持續專注）' },
];
const RESISTANCE_OPTIONS = [
  { v: '1.0', l: '低（本來就願意做）' },
  { v: '1.2', l: '中（需要提醒自己）' },
  { v: '1.4', l: '高（很想拖延或逃避）' },
];

// ── Main render ──────────────────────────────────────────────────────────────
export function renderSettings(container) {
  _renderView(container);
}

function _renderView(container) {
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

  const isAdvanced = state.user?.mode === 'advanced';
  const tasksHtml = state.tasks.length
    ? state.tasks.map(t => {
        const vcls    = t.value === 'S' ? 'badge-s' : t.value === 'A' ? 'badge-a' : t.value === 'B' ? 'badge-b' : 'badge-d';
        const canEdit = isAdvanced || !t.isDefault;
        return `
          <div class="log-item">
            ${t.iconImg
              ? `<img src="${t.iconImg}" class="log-icon-img">`
              : `<span class="log-emoji">${t.emoji || '🎯'}</span>`}
            <div class="log-info">
              <div class="log-name">${escHtml(t.name)}${t.isDefault ? ' <span class="badge-default">預設</span>' : ''}</div>
              <div class="log-time">
                <span class="badge ${vcls}">${t.value}</span>
                ${t.category === 'focus' ? '<span class="badge badge-nature">專注</span>' : '<span class="badge badge-nature">即時</span>'}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              ${canEdit
                ? `<button class="btn btn-outline btn-sm" data-edit="${t.id}">編輯</button>
                   <button class="btn-danger-sm" data-del="${t.id}">刪除</button>`
                : `<span style="font-size:12px;color:var(--text-muted);padding:0 4px">🔒</span>`}
            </div>
          </div>
        `;
      }).join('')
    : `<div class="empty-state"><div class="empty-icon">🎯</div><p>還沒有任何任務</p></div>`;

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
          ${hasBg
            ? `<img src="${storage.getBgImage()}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`
            : '<span style="font-size:28px">🏔️</span>'}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex:1">
          <button class="btn btn-outline btn-sm" id="bg-upload-btn">上傳圖片</button>
          ${hasBg ? `<button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.3)" id="bg-clear-btn">移除背景</button>` : ''}
        </div>
      </div>
      <input type="file" id="bg-input" accept="image/*" style="display:none">
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px">啟用背景圖後，介面自動套用玻璃模糊效果</div>
    </div>

    <!-- Mode -->
    <div class="card">
      <div class="card-title">🔧 操作模式</div>
      <div class="mode-row">
        <div class="mode-info">
          <div class="mode-name">${state.user?.mode === 'advanced' ? '進階模式' : '普通模式'}</div>
          <div class="mode-desc">${state.user?.mode === 'advanced'
            ? '所有任務可自由編輯，包括預設任務的評級與難度'
            : '預設任務鎖定，只能新增自訂任務'}</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="mode-toggle" ${state.user?.mode === 'advanced' ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="mode-warning ${state.user?.mode === 'advanced' ? '' : 'hidden'}" id="mode-warning">
        ⚠️ 進階模式下修改預設任務評級會影響積分公平性，自行負責。
      </div>
    </div>

    <!-- Tasks -->
    <div class="card">
      <div class="card-title">🎯 任務管理</div>
      <div id="tasks-list">${tasksHtml}</div>
      <button class="btn btn-primary" style="margin-top:12px" id="add-task-btn">+ 新增任務</button>
    </div>

    <!-- Account -->
    <div class="card">
      <div class="card-title">👤 帳號</div>
      <div class="account-row">
        <div class="account-info">
          <div class="account-name">${escHtml(state.user?.name || '使用者')}</div>
          <div class="account-sub" id="account-email">載入中…</div>
        </div>
        <button class="btn btn-outline btn-sm" id="signout-btn">登出</button>
      </div>
      <div class="account-divider"></div>
      <button class="btn-text-danger" id="reset-btn">清除本機快取資料（重新登入後可從雲端還原）</button>
    </div>
  `;

  _setupListeners(container);
}

// ── Listeners ────────────────────────────────────────────────────────────────
function _setupListeners(container) {
  // Theme
  container.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      applyTheme(card.dataset.themeId);
      _renderView(container);
    });
  });

  // Background
  container.querySelector('#bg-upload-btn').addEventListener('click', () => {
    container.querySelector('#bg-input').click();
  });
  container.querySelector('#bg-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await _compressImage(file, 900, 0.72);
    applyBgImage(compressed);
    _renderView(container);
  });
  const bgClear = container.querySelector('#bg-clear-btn');
  if (bgClear) {
    bgClear.addEventListener('click', () => {
      removeBgImage();
      _renderView(container);
    });
  }

  // Mode toggle
  container.querySelector('#mode-toggle').addEventListener('change', e => {
    if (!state.user) return;
    const newMode = e.target.checked ? 'advanced' : 'normal';
    if (newMode === 'advanced') {
      if (!confirm('切換到進階模式後可自由編輯所有任務，包括預設任務的評級。確定切換？')) {
        e.target.checked = false;
        return;
      }
    }
    state.user.mode = newMode;
    storage.saveUser(state.user);
    _renderView(container);
  });

  // Task CRUD
  container.querySelector('#add-task-btn').addEventListener('click', () => {
    _showTaskModal(container, null);
  });
  container.querySelector('#tasks-list').addEventListener('click', e => {
    const editId = e.target.dataset.edit;
    const delId  = e.target.dataset.del;
    if (editId) {
      const task = state.tasks.find(t => t.id === editId);
      if (task) _showTaskModal(container, task);
    }
    if (delId) {
      if (!confirm('確定刪除此任務？')) return;
      state.tasks = state.tasks.filter(t => t.id !== delId);
      storage.saveTasks(state.tasks);
      _renderView(container);
    }
  });

  // Show account email async
  import('../auth.js').then(({ getSession }) => {
    getSession().then(session => {
      const el = container.querySelector('#account-email');
      if (!el) return;
      el.textContent = session?.user?.email || '（遊客）';
    });
  });

  // Sign out
  container.querySelector('#signout-btn').addEventListener('click', () => {
    window.signOut();
  });

  // Clear local cache
  container.querySelector('#reset-btn').addEventListener('click', () => {
    if (!confirm('清除本機快取？重新登入後資料會從雲端自動還原。')) return;
    storage.clearAll();
    location.reload();
  });
}

// ── Task modal ───────────────────────────────────────────────────────────────
function _showTaskModal(container, task) {
  const isEdit = !!task;

  let selectedEmoji   = task?.emoji   || '🎯';
  let selectedIconImg = task?.iconImg || null;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';

  const currentNature = task?.taskNature || 'growth';
  const currentValue  = task?.value      || 'B';
  const currentDiff   = String(task?.difficulty ?? 0.7);
  const currentRes    = String(task?.resistance  ?? 1.0);
  const currentCat    = task?.category   || 'focus';

  // Value options — filter based on nature rules
  // entertainment → only D; maintenance/obligation/recovery → up to A; growth → S allowed
  const valueOpts = VALUE_OPTIONS.map(o => {
    let disabled = false;
    if (currentNature === 'entertainment' && o.v !== 'D') disabled = true;
    if (['maintenance','obligation','recovery'].includes(currentNature) && o.v === 'S') disabled = true;
    return `<option value="${o.v}" ${currentValue === o.v ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escHtml(o.l)}</option>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal-box modal-box-tall">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? '編輯任務' : '新增任務'}</span>
        <button class="modal-close" id="tm-close">✕</button>
      </div>

      <!-- Icon -->
      <div class="form-group">
        <label class="form-label">圖示</label>
        <div class="icon-row">
          <div class="icon-preview" id="tm-icon-preview">
            ${selectedIconImg
              ? `<img src="${selectedIconImg}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
              : selectedEmoji}
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-outline btn-sm" id="tm-icon-upload-btn">📷 上傳圖示</button>
            <button class="btn btn-outline btn-sm" id="tm-icon-clear-btn" ${!selectedIconImg ? 'style="display:none"' : ''}>使用 Emoji</button>
          </div>
          <input type="file" id="tm-icon-input" accept="image/*" style="display:none">
        </div>
      </div>
      <div class="form-group" id="tm-emoji-section" ${selectedIconImg ? 'style="display:none"' : ''}>
        <label class="form-label">或選擇 Emoji <span id="tm-emoji-preview">${selectedEmoji}</span></label>
        <div class="emoji-picker">
          ${EMOJI_LIST.map(e => `<button class="emoji-option ${e === selectedEmoji ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
        </div>
      </div>

      <!-- Name -->
      <div class="form-group">
        <label class="form-label">任務名稱</label>
        <input class="form-input" id="tm-name" placeholder="例：深度閱讀 30 分鐘" maxlength="30" value="${escHtml(task?.name || '')}">
      </div>

      <!-- Category -->
      <div class="form-group">
        <label class="form-label">類型</label>
        <select class="form-input" id="tm-category">
          <option value="instant" ${currentCat === 'instant' ? 'selected' : ''}>即時（Instant）— 點擊即完成</option>
          <option value="focus"   ${currentCat === 'focus'   ? 'selected' : ''}>專注（Focus）— 計時後結算</option>
        </select>
      </div>

      <!-- Nature -->
      <div class="form-group">
        <label class="form-label">性質</label>
        <select class="form-input" id="tm-nature">
          ${NATURE_OPTIONS.map(o =>
            `<option value="${o.v}" ${currentNature === o.v ? 'selected' : ''}>${escHtml(o.l)}</option>`
          ).join('')}
        </select>
      </div>

      <!-- Value -->
      <div class="form-group">
        <label class="form-label">
          價值
          <button type="button" class="info-btn" data-tip="value">ⓘ</button>
        </label>
        <select class="form-input" id="tm-value">${valueOpts}</select>
        <div id="tm-value-tip" class="field-tip hidden">
          <b>S</b>：連做 30-90 天，會明顯提升能力、收入、作品或健康<br>
          <b>A</b>：有實質幫助，但不是最核心槓桿<br>
          <b>B</b>：不做會亂，但做了不會明顯變強<br>
          <b>D</b>：主要是放鬆、消遣、娛樂
        </div>
      </div>

      <!-- Difficulty -->
      <div class="form-group">
        <label class="form-label">
          難度
          <button type="button" class="info-btn" data-tip="difficulty">ⓘ</button>
        </label>
        <select class="form-input" id="tm-difficulty">
          ${DIFFICULTY_OPTIONS.map(o =>
            `<option value="${o.v}" ${currentDiff === o.v ? 'selected' : ''}>${escHtml(o.l)}</option>`
          ).join('')}
        </select>
        <div id="tm-difficulty-tip" class="field-tip hidden">
          <b>低</b>：5-15 分鐘，可立刻開始<br>
          <b>中</b>：15-45 分鐘，需要切換狀態<br>
          <b>高</b>：45 分鐘以上，需持續專注或高心智負荷
        </div>
      </div>

      <!-- Resistance -->
      <div class="form-group">
        <label class="form-label">
          抗拒感
          <button type="button" class="info-btn" data-tip="resistance">ⓘ</button>
        </label>
        <select class="form-input" id="tm-resistance">
          ${RESISTANCE_OPTIONS.map(o =>
            `<option value="${o.v}" ${currentRes === o.v ? 'selected' : ''}>${escHtml(o.l)}</option>`
          ).join('')}
        </select>
        <div id="tm-resistance-tip" class="field-tip hidden">
          <b>低</b>：本來就願意做<br>
          <b>中</b>：需要提醒自己<br>
          <b>高</b>：很想拖延或逃避
        </div>
      </div>

      <!-- S-class fields -->
      <div id="tm-s-fields" style="${currentValue !== 'S' ? 'display:none' : ''}">
        <div class="form-group">
          <label class="form-label">為什麼是 S 級？（必填）</label>
          <textarea class="form-input" id="tm-reason" rows="2" placeholder="連做 30 天後會明顯帶來哪些改變？">${escHtml(task?.reason || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">成功標準（必填）</label>
          <input class="form-input" id="tm-success-criteria" placeholder="例：完成一份可交付的輸出成果" value="${escHtml(task?.successCriteria || '')}">
        </div>
      </div>

      <!-- XP preview -->
      <div id="tm-xp-preview" class="xp-preview-box"></div>

      <button class="btn btn-primary" id="tm-save">${isEdit ? '儲存變更' : '新增任務'}</button>
    </div>
  `;
  document.body.appendChild(modal);

  const previewEl   = modal.querySelector('#tm-icon-preview');
  const emojiSec    = modal.querySelector('#tm-emoji-section');
  const clearImgBtn = modal.querySelector('#tm-icon-clear-btn');
  const xpPreview   = modal.querySelector('#tm-xp-preview');

  // ── Icon upload ────────────────────────────────────────────────────────────
  modal.querySelector('#tm-icon-upload-btn').addEventListener('click', () => {
    modal.querySelector('#tm-icon-input').click();
  });
  modal.querySelector('#tm-icon-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    selectedIconImg = await _compressImage(file, 200, 0.82);
    previewEl.innerHTML = `<img src="${selectedIconImg}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    emojiSec.style.display = 'none';
    clearImgBtn.style.display = '';
  });
  clearImgBtn.addEventListener('click', () => {
    selectedIconImg = null;
    previewEl.textContent = selectedEmoji;
    emojiSec.style.display = '';
    clearImgBtn.style.display = 'none';
  });

  // ── Emoji picker ───────────────────────────────────────────────────────────
  modal.querySelectorAll('.emoji-option').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedEmoji = btn.dataset.emoji;
      modal.querySelector('#tm-emoji-preview').textContent = selectedEmoji;
      if (!selectedIconImg) previewEl.textContent = selectedEmoji;
    });
  });

  // ── Info toggles ───────────────────────────────────────────────────────────
  modal.querySelectorAll('.info-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tip = modal.querySelector(`#tm-${btn.dataset.tip}-tip`);
      if (tip) tip.classList.toggle('hidden');
    });
  });

  // ── Nature / Value cross-validation ────────────────────────────────────────
  const natureEl = modal.querySelector('#tm-nature');
  const valueEl  = modal.querySelector('#tm-value');
  const sFields  = modal.querySelector('#tm-s-fields');

  function updateValueOptions() {
    const nature = natureEl.value;
    Array.from(valueEl.options).forEach(opt => {
      if (nature === 'entertainment' && opt.value !== 'D') opt.disabled = true;
      else if (['maintenance','obligation','recovery'].includes(nature) && opt.value === 'S') opt.disabled = true;
      else opt.disabled = false;
    });
    if (valueEl.options[valueEl.selectedIndex]?.disabled) {
      valueEl.value = nature === 'entertainment' ? 'D' : 'B';
    }
    sFields.style.display = valueEl.value === 'S' ? '' : 'none';
    updateXPPreview();
  }

  natureEl.addEventListener('change', updateValueOptions);
  valueEl.addEventListener('change', () => {
    sFields.style.display = valueEl.value === 'S' ? '' : 'none';
    updateXPPreview();
  });
  modal.querySelector('#tm-difficulty').addEventListener('change', updateXPPreview);
  modal.querySelector('#tm-resistance').addEventListener('change', updateXPPreview);

  function updateXPPreview() {
    const v  = valueEl.value;
    const d  = parseFloat(modal.querySelector('#tm-difficulty').value);
    const r  = parseFloat(modal.querySelector('#tm-resistance').value);
    const vw = { S: 3.2, A: 2.2, B: 1.2, D: 0 }[v] ?? 0;
    const dw = d; const rw = r;
    const baseXP = Math.round(20 * vw * dw * rw);
    xpPreview.innerHTML = baseXP > 0
      ? `<span>預估 XP：<strong>+${baseXP}</strong>（完成）/ <strong>+${Math.round(baseXP * 0.6)}</strong>（部分完成）</span>`
      : `<span style="color:var(--text-muted)">此任務不提供 XP</span>`;
  }
  updateXPPreview();

  // ── Close ─────────────────────────────────────────────────────────────────
  modal.querySelector('#tm-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => modal.querySelector('#tm-name').focus(), 80);

  // ── Save ──────────────────────────────────────────────────────────────────
  modal.querySelector('#tm-save').addEventListener('click', () => {
    const name     = modal.querySelector('#tm-name').value.trim();
    const category = modal.querySelector('#tm-category').value;
    const nature   = modal.querySelector('#tm-nature').value;
    const value    = modal.querySelector('#tm-value').value;
    const diff     = parseFloat(modal.querySelector('#tm-difficulty').value);
    const resist   = parseFloat(modal.querySelector('#tm-resistance').value);

    if (!name) { modal.querySelector('#tm-name').focus(); return; }

    // A confirmation
    if (!isEdit && value === 'A') {
      if (!confirm('確認設為 A 級？\n「有實質幫助，長期能看到明顯改變」才算 A 級。')) return;
    }

    // S validation
    if (value === 'S') {
      if (nature !== 'growth') {
        alert('S 級任務的性質必須是「成長」。');
        return;
      }
      const reason   = modal.querySelector('#tm-reason').value.trim();
      const criteria = modal.querySelector('#tm-success-criteria').value.trim();
      if (!reason || !criteria) {
        alert('S 級任務必須填寫「原因」與「成功標準」。');
        return;
      }
    }

    // S daily limit check (new tasks only)
    if (!isEdit && value === 'S') {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayS = state.tasks.filter(t => t.value === 'S' && t.createdAt === todayStr).length;
      if (todayS >= 2) { alert('今日已新增 2 個 S 級任務（每日上限）。'); return; }
    }

    const impactType =
      nature === 'recovery'      ? 'recovery' :
      nature === 'entertainment' ? 'entertainment' : 'task';

    const minMap   = { 0.4: 0, 0.7: 15, 1.0: 25 };
    const capMap   = { S: 300, A: 200, B: 100, D: 0 };

    const saved = {
      id:                  isEdit ? task.id : uid(),
      name,
      category,
      impactType,
      taskNature:          nature,
      value,
      difficulty:          diff,
      resistance:          resist,
      emoji:               selectedEmoji,
      iconImg:             selectedIconImg,
      minEffectiveMinutes: category === 'focus' ? (minMap[diff] ?? 15) : 0,
      cooldownMinutes:     task?.cooldownMinutes ?? 0,
      dailyXpCap:          task?.dailyXpCap ?? (capMap[value] ?? 100),
      requiresReasonIfS:   value === 'S',
      reason:              modal.querySelector('#tm-reason')?.value.trim() || task?.reason || '',
      successCriteria:     modal.querySelector('#tm-success-criteria')?.value.trim() || task?.successCriteria || '',
      hasDeliverable:      task?.hasDeliverable ?? false,
      valueConfidence:     task?.valueConfidence ?? 100,
      createdAt:           task?.createdAt ?? new Date().toISOString().slice(0, 10),
    };

    if (isEdit) {
      const idx = state.tasks.findIndex(t => t.id === task.id);
      if (idx !== -1) state.tasks[idx] = saved;
    } else {
      state.tasks.push(saved);
    }

    storage.saveTasks(state.tasks);
    modal.remove();
    _renderView(container);
  });
}

// ── Image compression ────────────────────────────────────────────────────────
function _compressImage(file, maxPx, quality) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const min = Math.min(img.width, img.height);
        const size = Math.min(min, maxPx);
        canvas.width = size; canvas.height = size;
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
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
