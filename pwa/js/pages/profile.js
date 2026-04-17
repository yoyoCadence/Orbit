import { state }                                         from '../state.js';
import { storage }                                        from '../storage.js';
import { getLevelInfo, getDisplayTitle, xpTable,
         getAllTemplates }                                 from '../leveling.js';

export function renderProfile(container) {
  const user   = state.user;
  if (!user) return;

  const info   = getLevelInfo(user.totalXP || 0);
  const title  = getDisplayTitle(info.level, user);
  const energy = state.energy;

  const joined     = new Date(user.createdAt + 'T00:00:00');
  const daysActive = Math.max(1, Math.ceil((Date.now() - joined.getTime()) / 86400000));
  const activeDays = new Set(state.sessions.map(s => s.date)).size;
  const totalSessions = state.sessions.filter(s => s.result !== 'invalid').length;

  const avatarContent = user.avatar
    ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="avatar">`
    : `<span style="font-size:40px">👤</span>`;

  // Energy bar
  const energyPct = Math.round((energy.currentEnergy / energy.maxEnergy) * 100);
  const energyCls = energyPct >= 60 ? 'energy-bar-high' : energyPct >= 30 ? 'energy-bar-mid' : 'energy-bar-low';

  // Streak label
  const streakDays  = user.streakDays || 0;
  const streakLabel = streakDays >= 30 ? '🔥🔥🔥' : streakDays >= 14 ? '🔥🔥' : streakDays >= 7 ? '🔥' : '';

  // XP table — initial 10 rows from current level
  const XP_BATCH = 10;
  const XP_MAX   = 100;
  const tableRows = xpTable(info.level, Math.min(XP_BATCH, XP_MAX - info.level + 1))
    .map(r => _xpTableRow(r, info, user)).join('');

  // Title template picker — built-in + user custom templates
  const currentTemplate  = user.titleTemplate || 'rpg';
  const customTemplates  = user.customTemplates || {};
  const allTemplates     = getAllTemplates(customTemplates);

  const templateBtns = Object.entries(allTemplates).map(([key, tmpl]) => {
    const isActive  = currentTemplate === key;
    return `
      <div class="title-tmpl-item">
        <button class="title-tmpl-btn ${isActive ? 'active' : ''}" data-template="${key}">
          ${tmpl.icon} ${tmpl.name}
        </button>
        <button class="title-tmpl-edit-btn" data-edit-template="${key}" title="編輯主題">✏️</button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Avatar + Name -->
    <div class="profile-top">
      <div class="avatar-wrap" id="avatar-wrap">
        <div class="avatar-circle">${avatarContent}</div>
        <div class="avatar-edit-badge">✏️</div>
      </div>
      <input type="file" id="avatar-input" accept="image/*" style="display:none">

      <div class="profile-name" id="profile-name-display">
        ${escHtml(user.name)}<span class="edit-hint">✏️</span>
      </div>
      <div class="profile-joined">加入於 ${user.createdAt}</div>
    </div>

    <!-- Level card -->
    <div class="card level-card">
      <div class="level-big">${info.level}</div>
      <div class="level-title-text">${title}</div>
      <div class="xp-bar-label">
        <span>升級進度</span>
        <span>${info.currentXP} / ${info.needed} XP</span>
      </div>
      <div class="xp-bar-track">
        <div class="xp-bar-fill" style="width:${info.percent}%"></div>
      </div>
    </div>

    <!-- Title customization -->
    <div class="card">
      <div class="card-title">🏷️ 等級稱號</div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
        選擇主題後自動依等級更新。點 ✏️ 可編輯任意主題的每一等稱號，或新增全新主題。
      </p>

      <div class="title-tmpl-list">${templateBtns}</div>

      <button class="btn btn-outline btn-sm" id="add-template-btn" style="margin-top:10px;width:100%">
        ＋ 新增自訂主題
      </button>

      <div class="form-group" style="margin-top:14px">
        <label class="form-label">覆蓋稱號（選填，留空則使用主題稱號）</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="custom-title-input"
                 placeholder="輸入覆蓋稱號…" maxlength="20"
                 value="${escHtml(user.customTitle || '')}">
          <button class="btn btn-outline btn-sm" id="custom-title-save">儲存</button>
          ${user.customTitle ? `<button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.3)" id="custom-title-clear">清除</button>` : ''}
        </div>
      </div>

      <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
        目前稱號：<strong>${escHtml(title)}</strong>
      </div>
    </div>

    <!-- Streak + Energy -->
    <div class="card">
      <div class="card-title">⚡ 今日精力 & 連勝</div>
      <div class="energy-section">
        <div class="energy-top">
          <span>精力 ${energy.currentEnergy} / ${energy.maxEnergy}</span>
          <span>${energyPct}%</span>
        </div>
        <div class="xp-bar-track">
          <div class="xp-bar-fill ${energyCls}" style="width:${energyPct}%"></div>
        </div>
      </div>
      <div class="streak-section">
        <div class="streak-big">${streakDays} ${streakLabel}</div>
        <div class="streak-lbl">連勝天數</div>
        <div class="streak-hint">連勝 XP 加成：×${(1 + 0.02 * Math.floor(streakDays / 5)).toFixed(2).replace(/\.?0+$/, '')}</div>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${user.totalXP || 0}</div>
        <div class="stat-label">累計 XP</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalSessions}</div>
        <div class="stat-label">完成任務</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${activeDays}</div>
        <div class="stat-label">活躍天數</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${daysActive}</div>
        <div class="stat-label">使用天數</div>
      </div>
    </div>

    <!-- XP Table -->
    <div class="card">
      <div class="card-title">升等所需 XP</div>
      <div id="xp-table-rows">${tableRows}</div>
      ${info.level + XP_BATCH <= XP_MAX ? `
        <button class="btn btn-outline btn-sm xp-more-btn"
                data-from="${info.level}" data-shown="${XP_BATCH}"
                style="width:100%;margin-top:8px">
          顯示更多
        </button>` : ''}
      <div class="xp-table-note">
        公式：XP(n) = 120 + 45×(n-1) + 10×(n-1)^1.35，每級遞增。<br>
        S 任務完成約 90 XP、A 任務約 37–53 XP。
      </div>
    </div>
  `;

  // Avatar upload
  document.getElementById('avatar-wrap').addEventListener('click', () => {
    document.getElementById('avatar-input').click();
  });
  document.getElementById('avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      state.user.avatar = ev.target.result;
      storage.saveUser(state.user);
      renderProfile(container);
      import('../app.js').then(({ updateHeader }) => updateHeader());
    };
    reader.readAsDataURL(file);
  });

  // Edit name
  document.getElementById('profile-name-display').addEventListener('click', () => {
    showNameModal(container);
  });

  // Template select buttons
  container.querySelectorAll('.title-tmpl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.user.titleTemplate = btn.dataset.template;
      state.user.customTitle   = '';
      storage.saveUser(state.user);
      renderProfile(container);
      import('../app.js').then(({ updateHeader }) => updateHeader());
    });
  });

  // Template edit buttons (✏️)
  container.querySelectorAll('.title-tmpl-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.editTemplate;
      showTemplateEditor(container, key);
    });
  });

  // Add new template
  document.getElementById('add-template-btn').addEventListener('click', () => {
    showTemplateEditor(container, null);
  });

  // Custom title save
  document.getElementById('custom-title-save').addEventListener('click', () => {
    const val = document.getElementById('custom-title-input').value.trim();
    state.user.customTitle = val || '';
    storage.saveUser(state.user);
    renderProfile(container);
    import('../app.js').then(({ updateHeader }) => updateHeader());
  });

  // XP table — show more
  container.querySelector('.xp-more-btn')?.addEventListener('click', function () {
    const fromLevel = parseInt(this.dataset.from);
    const shown     = parseInt(this.dataset.shown);
    const XP_BATCH  = 10;
    const XP_MAX    = 100;
    const nextStart = fromLevel + shown;
    const nextCount = Math.min(XP_BATCH, XP_MAX - nextStart + 1);
    const newRows   = xpTable(nextStart, nextCount).map(r => _xpTableRow(r, info, user)).join('');
    document.getElementById('xp-table-rows').insertAdjacentHTML('beforeend', newRows);
    this.dataset.shown = shown + nextCount;
    if (nextStart + nextCount > XP_MAX) this.remove();
  });

  // Custom title clear
  document.getElementById('custom-title-clear')?.addEventListener('click', () => {
    state.user.customTitle = '';
    storage.saveUser(state.user);
    renderProfile(container);
    import('../app.js').then(({ updateHeader }) => updateHeader());
  });
}

// ─── TIER_LEVELS: the 11 threshold levels in all built-in templates ───────────
const TIER_LEVELS = [100, 75, 50, 40, 30, 25, 20, 15, 10, 5, 1];

/**
 * Open a modal to create or edit a title template.
 * @param {HTMLElement} container  — profile container (for re-render on save)
 * @param {string|null} editKey    — existing template key to edit, or null to create new
 */
function showTemplateEditor(container, editKey) {
  const existing = document.getElementById('template-editor-modal');
  if (existing) existing.remove();

  const customTemplates = state.user.customTemplates || {};
  const allTemplates    = getAllTemplates(customTemplates);

  // Pre-fill from existing template (built-in or custom)
  const src = editKey ? allTemplates[editKey] : null;
  const isNew = !editKey;

  const tierInputs = TIER_LEVELS.map((lvl, i) => {
    const defaultTitle = src
      ? (src.tiers.find(([min]) => min === lvl) || src.tiers[i] || [])[1] || ''
      : '';
    return `
      <div class="tier-editor-row">
        <span class="tier-editor-lv">Lv.${lvl}+</span>
        <input class="form-input tier-title-input" data-tier="${lvl}"
               placeholder="稱號…" maxlength="20" value="${escHtml(defaultTitle)}">
      </div>
    `;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'template-editor-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-height:85vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${isNew ? '新增自訂主題' : '編輯主題'}</span>
        <button class="modal-close" id="tmpl-modal-close">✕</button>
      </div>

      <div class="form-group">
        <label class="form-label">主題名稱</label>
        <input class="form-input" id="tmpl-name" maxlength="20"
               placeholder="例：我的主題" value="${escHtml(src?.name || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">主題圖示（Emoji）</label>
        <input class="form-input" id="tmpl-icon" maxlength="4"
               placeholder="🌟" value="${escHtml(src?.icon || '')}">
      </div>

      <div style="margin:14px 0 8px;font-size:13px;font-weight:600;color:var(--text-muted)">
        各等級稱號（由高到低）
      </div>
      ${tierInputs}

      <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
        <button class="btn btn-primary" id="tmpl-save-btn" style="flex:1">儲存主題</button>
        ${!isNew && customTemplates[editKey] ? `
          <button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.3)" id="tmpl-delete-btn">刪除</button>
        ` : ''}
      </div>
      ${!isNew && !customTemplates[editKey] ? `
        <p style="font-size:11px;color:var(--text-muted);margin-top:8px">
          修改內建主題會建立同名的自訂版本。
        </p>
      ` : ''}
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#tmpl-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#tmpl-save-btn').addEventListener('click', () => {
    const name = modal.querySelector('#tmpl-name').value.trim();
    const icon = modal.querySelector('#tmpl-icon').value.trim() || '🏷️';
    if (!name) { alert('請輸入主題名稱'); return; }

    const tiers = TIER_LEVELS.map(lvl => {
      const val = modal.querySelector(`[data-tier="${lvl}"]`).value.trim();
      return [lvl, val || `Lv.${lvl}`];
    });

    const key = isNew
      ? 'custom_' + Date.now()
      : editKey;

    if (!state.user.customTemplates) state.user.customTemplates = {};
    state.user.customTemplates[key] = { name, icon, tiers };

    // Auto-select newly created template
    if (isNew) state.user.titleTemplate = key;

    storage.saveUser(state.user);
    modal.remove();
    renderProfile(container);
    import('../app.js').then(({ updateHeader }) => updateHeader());
  });

  modal.querySelector('#tmpl-delete-btn')?.addEventListener('click', () => {
    if (!confirm(`確定刪除主題「${src?.name}」？`)) return;
    delete state.user.customTemplates[editKey];
    // Fall back to rpg if deleted template was selected
    if (state.user.titleTemplate === editKey) state.user.titleTemplate = 'rpg';
    storage.saveUser(state.user);
    modal.remove();
    renderProfile(container);
    import('../app.js').then(({ updateHeader }) => updateHeader());
  });
}

function showNameModal(container) {
  const existing = document.getElementById('name-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'name-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">修改名稱</span>
        <button class="modal-close" id="name-modal-close">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">你的名稱</label>
        <input class="form-input" id="name-input" value="${escHtml(state.user.name)}" maxlength="20">
      </div>
      <button class="btn btn-primary" id="name-save-btn">儲存</button>
    </div>
  `;
  document.body.appendChild(modal);

  const input = modal.querySelector('#name-input');
  input.focus(); input.select();
  modal.querySelector('#name-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#name-save-btn').addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) return;
    state.user.name = name;
    storage.saveUser(state.user);
    modal.remove();
    renderProfile(container);
  });
}

function _xpTableRow(r, info, user) {
  const rowTitle = getDisplayTitle(r.from, user);
  return `
    <div class="xp-table-row ${r.from === info.level ? 'current-level' : ''}">
      <span class="xp-table-lv">Lv.${r.from}</span>
      <span class="xp-table-title">${escHtml(rowTitle)}</span>
      <span class="xp-table-xp">${r.from === info.level ? `${info.currentXP} / ` : ''}${r.xp} XP</span>
    </div>
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
