import { state }                      from '../state.js';
import { storage }                     from '../storage.js';
import { applyTheme, applyBgImage, removeBgImage, applyRandomThemeForToday, APP_VERSION } from '../app.js';
import { uid, today }                  from '../utils.js';

// ── Theme definitions ────────────────────────────────────────────────────────
export const THEMES = [
  { id: 'dark-purple', name: '暗夜紫', icon: '🌌', colors: ['#7c3aed', '#f59e0b', '#0d0d1a'] },
  { id: 'aurora-blue', name: '極光藍', icon: '🌊', colors: ['#0ea5e9', '#06d6a0', '#050d1a'] },
  { id: 'emerald',     name: '翡翠綠', icon: '🌿', colors: ['#16a34a', '#fbbf24', '#080f0a'] },
  { id: 'flame',       name: '赤　焰', icon: '🔥', colors: ['#ea580c', '#fde047', '#120a05'] },
  { id: 'neon-pink',   name: '霓虹粉', icon: '💜', colors: ['#db2777', '#a855f7', '#12040f'] },
  { id: 'light',       name: '純白光', icon: '☀️', colors: ['#7c3aed', '#d97706', '#f1f5f9'] },
];

export const THEMES_NEW = [
  { id: 'wabi',      name: '日系簡約', icon: '⛩️', colors: ['#9b2335', '#7a6a4a', '#f5f0e8'] },
  { id: 'material',  name: 'Material', icon: '💎', colors: ['#d0bcff', '#efb8c8', '#1c1b1f'] },
  { id: 'cyberpunk', name: '賽博龐克', icon: '⚡', colors: ['#00ff9f', '#ff2d78', '#050508'] },
];

export const THEMES_CREATIVE = [
  { id: 'pixel',   name: '像　　素', icon: '👾', colors: ['#39ff14', '#ffff00', '#0a0a0a'] },
  { id: 'anime',   name: '動　　漫', icon: '🌸', colors: ['#ff6b9d', '#7ec8e3', '#fff5f8'] },
  { id: 'gothic',  name: '哥德蘿莉', icon: '🖤', colors: ['#c41e3a', '#d4af37', '#0d0009'] },
  { id: 'github',  name: 'GitHub',   icon: '🐙', colors: ['#1f6feb', '#2da44e', '#0d1117'] },
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

// ── Pro upgrade section ───────────────────────────────────────────────────────
function _proSectionHtml() {
  const isPro    = storage.isProUser();
  const isTrial  = storage.isTrialUser();
  const daysLeft = storage.getTrialDaysRemaining();
  const expiry   = storage.getProExpiry();

  // ── Active Pro (paid, not trial) ─────────────────────────────────────────
  if (isPro && !isTrial) {
    const expiryStr = expiry
      ? `有效期至 ${new Date(expiry).toLocaleDateString('zh-TW')}`
      : '終身方案';
    return `
      <div class="pro-active-banner">
        <span class="pro-active-icon">✦</span>
        <div>
          <div class="pro-active-title">你已是 Orbit Pro 用戶</div>
          <div class="pro-active-sub">${expiryStr}</div>
        </div>
      </div>
      <div class="pro-feat-grid">
        <div class="pro-feat-item" data-feat="0"><span class="pro-feat-item-icon">∞</span><span class="pro-feat-item-label">完整歷史紀錄</span><button class="pro-feat-info-btn" data-feat="0" aria-label="說明">!</button></div>
        <div class="pro-feat-item" data-feat="1"><span class="pro-feat-item-icon">🛡️</span><span class="pro-feat-item-label">Streak Shield</span><button class="pro-feat-info-btn" data-feat="1" aria-label="說明">!</button></div>
        <div class="pro-feat-item" data-feat="2"><span class="pro-feat-item-icon">📈</span><span class="pro-feat-item-label">Habit Heatmap</span><button class="pro-feat-info-btn" data-feat="2" aria-label="說明">!</button></div>
        <div class="pro-feat-item" data-feat="3"><span class="pro-feat-item-icon">📤</span><span class="pro-feat-item-label">CSV 匯出</span><button class="pro-feat-info-btn" data-feat="3" aria-label="說明">!</button></div>
      </div>
      <div class="pro-feat-teaser pro-feat-teaser--active">✦ 更多功能持續釋出中，感謝你成為早期支持者</div>`;
  }

  // ── Trial countdown bar ───────────────────────────────────────────────────
  const trialHtml = isTrial ? `
    <div class="pro-trial-status">
      <div class="pro-trial-top">
        <span class="pro-trial-label">免費試用中</span>
        <span class="pro-trial-days"><strong>${daysLeft}</strong> 天後到期</span>
      </div>
      <div class="pro-trial-bar-track">
        <div class="pro-trial-bar-fill" style="width:${Math.round((15 - daysLeft) / 15 * 100)}%"></div>
      </div>
    </div>
    <div class="pro-section-divider"></div>` : '';

  // ── Feature highlights (2×2 grid) ────────────────────────────────────────
  const FEAT_DETAILS = [
    { icon: '∞', label: '完整歷史紀錄',
      detail: '免費版僅保留 30 天紀錄。Pro 永久保留所有打卡與 XP 歷程，讓你看見真實的成長曲線。' },
    { icon: '🛡️', label: 'Streak Shield',
      detail: '每月獲得 2 張保護卡。偶爾忘記打卡？用盾牌抵擋中斷，連勝不歸零。' },
    { icon: '📈', label: 'Habit Heatmap',
      detail: '完整熱力圖顯示全年每日活躍度。免費版僅 90 天。一眼看出哪幾週你最拼。' },
    { icon: '📤', label: 'CSV 匯出',
      detail: '一鍵匯出所有打卡紀錄為 CSV，可匯入 Excel / Notion 做進一步分析，資料永遠是你的。' },
  ];
  const featItemsHtml = FEAT_DETAILS.map((f, i) => `
    <div class="pro-feat-item" data-feat="${i}">
      <span class="pro-feat-item-icon">${f.icon}</span>
      <span class="pro-feat-item-label">${f.label}</span>
      <button class="pro-feat-info-btn" data-feat="${i}" aria-label="說明">!</button>
    </div>`).join('');
  const featGrid = `
    <div class="pro-feat-grid">${featItemsHtml}</div>
    <div class="pro-feat-teaser">✦ 還有 Pro 專屬隱藏福利，升級後自行發現</div>
    <div class="pro-section-divider"></div>`;

  // ── Anchor: always-visible yearly plan ───────────────────────────────────
  const anchorHtml = `
    <div class="pro-anchor-plan">
      <div class="pro-anchor-badge">最多人選擇</div>
      <div class="pro-anchor-row">
        <div class="pro-anchor-info">
          <div class="pro-anchor-label">年費方案</div>
          <div class="pro-anchor-price">NT$699<span class="pro-anchor-unit">/年</span></div>
          <div class="pro-anchor-desc">≈ NT$58/月 &nbsp;·&nbsp; 省 41%</div>
        </div>
        <button class="pro-anchor-btn" id="pro-subscribe-yearly">立即訂閱</button>
      </div>
      <button class="pro-view-all-btn" id="pro-view-all">查看全部方案 ↓</button>
    </div>
    <div class="pro-notice">升級後立即生效 · 試用期間資料全部保留</div>`;

  // ── Streak unlock progress (free, non-trial, not yet unlocked) ──────────────
  const streakDays = state.user?.streakDays || 0;
  const streakUnlockHtml = (!isPro && !isTrial && !state.user?.streakUnlockUsed) ? `
    <div class="streak-unlock-row" style="margin-bottom:16px">
      <div class="streak-unlock-label">
        <span>🔓 連勝解鎖 Pro</span>
        <span class="streak-unlock-count">${Math.min(streakDays, 45)}/45 天</span>
      </div>
      <div class="streak-unlock-track">
        <div class="streak-unlock-fill" style="width:${Math.min(100, Math.round(streakDays / 45 * 100))}%"></div>
      </div>
      <div class="streak-unlock-hint">達成 45 天連勝，自動解鎖 30 天免費 Pro！</div>
    </div>
    <div class="pro-section-divider"></div>` : '';

  return `${trialHtml}${streakUnlockHtml}${featGrid}${anchorHtml}`;
}

// ── Feature info popover ─────────────────────────────────────────────────────
function _showFeatPopover(anchor, feat) {
  document.getElementById('pro-feat-popover')?.remove();

  const pop = document.createElement('div');
  pop.id = 'pro-feat-popover';
  pop.className = 'pro-feat-popover';
  pop.innerHTML = `
    <div class="pro-feat-pop-title">${feat.icon} ${feat.label}</div>
    <div class="pro-feat-pop-body">${feat.detail}</div>
  `;
  document.body.appendChild(pop);

  // Position below the anchor button
  const rect = anchor.getBoundingClientRect();
  const popW = 240;
  let left = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
  pop.style.top  = `${rect.bottom + window.scrollY + 8}px`;
  pop.style.left = `${left}px`;

  const dismiss = () => {
    pop.classList.add('pro-feat-popover-out');
    setTimeout(() => pop.remove(), 180);
    document.removeEventListener('click', dismiss);
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

// ── Pro bottom sheet ─────────────────────────────────────────────────────────
function _showProSheet() {
  if (document.getElementById('pro-sheet-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pro-sheet-overlay';
  overlay.className = 'pro-sheet-overlay';

  overlay.innerHTML = `
    <div class="pro-sheet" id="pro-sheet">
      <div class="pro-sheet-handle"></div>
      <div class="pro-sheet-title">選擇 Orbit Pro 方案</div>
      <div class="pro-sheet-sub">升級後立即生效，隨時可取消</div>

      <div class="pro-sheet-plan pro-sheet-featured" data-plan="yearly">
        <div class="pro-sheet-plan-badge">省 41%</div>
        <div class="pro-sheet-plan-info">
          <div class="pro-sheet-plan-label">年費方案</div>
          <div class="pro-sheet-plan-price">NT$699<span class="pro-sheet-plan-unit">/年</span></div>
          <div class="pro-sheet-plan-desc">≈ NT$58/月</div>
        </div>
        <button class="pro-sheet-plan-btn pro-sheet-btn-primary" data-plan="yearly">選擇</button>
      </div>

      <div class="pro-sheet-plan" data-plan="monthly">
        <div class="pro-sheet-plan-info">
          <div class="pro-sheet-plan-label">月費方案</div>
          <div class="pro-sheet-plan-price">NT$99<span class="pro-sheet-plan-unit">/月</span></div>
          <div class="pro-sheet-plan-desc">隨時取消</div>
        </div>
        <button class="pro-sheet-plan-btn pro-sheet-btn-secondary" data-plan="monthly">選擇</button>
      </div>

      <div class="pro-sheet-plan" data-plan="lifetime">
        <div class="pro-sheet-plan-info">
          <div class="pro-sheet-plan-label">終身方案</div>
          <div class="pro-sheet-plan-price">NT$1,999<span class="pro-sheet-plan-unit"> 一次</span></div>
          <div class="pro-sheet-plan-desc">永久使用，不再續費</div>
        </div>
        <button class="pro-sheet-plan-btn pro-sheet-btn-secondary" data-plan="lifetime">選擇</button>
      </div>

      <div class="pro-sheet-notice">金流整合即將上線，敬請期待</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.add('pro-sheet-overlay-out');
    document.getElementById('pro-sheet')?.classList.add('pro-sheet-out');
    setTimeout(() => overlay.remove(), 280);
  };

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('.pro-sheet-plan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.showToast('金流整合即將上線，敬請期待！');
      close();
    });
  });
}

// ── Main render ──────────────────────────────────────────────────────────────
export function renderSettings(container) {
  _renderView(container);
}

function _goToProCard() {
  sessionStorage.setItem('orbit_pro_highlight', '1');
  setTimeout(() => window._scrollToProCard?.(), 50);
}

function _themeCardHtml(t, currentTheme, locked = false) {
  if (locked) {
    return `
    <div class="theme-card theme-card--locked" data-theme-id="${t.id}" data-locked="true">
      <div class="theme-preview">
        <div class="tp-bg" style="background:${t.colors[2]}">
          <div class="tp-surface">
            <div class="tp-primary" style="background:${t.colors[0]}"></div>
            <div class="tp-accent"  style="background:${t.colors[1]}"></div>
          </div>
        </div>
        <div class="theme-lock-overlay"><span class="pro-badge--inline">✦ Pro</span></div>
      </div>
      <div class="theme-name">${t.icon} ${t.name}</div>
    </div>
  `;
  }
  return `
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
  `;
}

function _renderView(container) {
  const currentTheme          = storage.getTheme();
  const randomThemeEnabled    = storage.getRandomThemeEnabled();
  const hasBg = !!storage.getBgImage();

  const isPro             = storage.isProUser() || storage.isTrialUser();
  const FREE_IDS          = new Set(['dark-purple', 'aurora-blue', 'emerald', 'flame', 'neon-pink']);
  const themeGrid         = THEMES.map(t => _themeCardHtml(t, currentTheme, !isPro && !FREE_IDS.has(t.id))).join('');
  const themeGridNew      = THEMES_NEW.map(t => _themeCardHtml(t, currentTheme, !isPro)).join('');
  const themeGridCreative = THEMES_CREATIVE.map(t => _themeCardHtml(t, currentTheme, !isPro)).join('');

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
      <div class="mode-row" style="margin-bottom:14px">
        <div class="mode-info">
          <div class="mode-name">每日隨機主題</div>
          <div class="mode-desc">每天自動套用一個隨機主題</div>
        </div>
        ${isPro
          ? `<label class="toggle-switch">
               <input type="checkbox" id="random-theme-toggle" ${randomThemeEnabled ? 'checked' : ''}>
               <span class="toggle-slider"></span>
             </label>`
          : `<button class="theme-toggle-lock" id="random-theme-lock" aria-label="升級 Pro 解鎖">🔒</button>`
        }
      </div>
      <div class="theme-section-label">經典主題</div>
      <div class="theme-grid">${themeGrid}</div>
      <div class="theme-section-label" style="margin-top:16px">新風格</div>
      <div class="theme-grid">${themeGridNew}</div>
      <div class="theme-section-label" style="margin-top:16px">創意主題</div>
      <div class="theme-grid">${themeGridCreative}</div>
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

    <!-- Focus Timer Pro settings -->
    ${(storage.isProUser() || storage.isTrialUser()) ? `
    <div class="card">
      <span class="pro-badge--corner">✦ Pro 專屬</span>
      <div class="card-title">⏱ 專注計時 Pro 設定</div>
      <div class="mode-row" style="margin-bottom:12px">
        <div class="mode-info">
          <div class="mode-name">完成音效</div>
          <div class="mode-desc">倒數結束或達到有效時間時播放提示音</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="focus-sound-toggle" ${state.user?.focusSoundEnabled !== false ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="mode-row">
        <div class="mode-info">
          <div class="mode-name">預設時長</div>
          <div class="mode-desc">開始專注時的預設倒數分鐘數</div>
        </div>
        <select class="form-input" id="focus-default-min-select" style="width:90px;flex-shrink:0">
          <option value="">不設定</option>
          ${[15, 25, 45, 90].map(m =>
            `<option value="${m}" ${(state.user?.focusDefaultMinutes ?? '') == m ? 'selected' : ''}>${m} 分</option>`
          ).join('')}
        </select>
      </div>
    </div>` : ''}

    <!-- New day start time -->
    <div class="card">
      <div class="card-title">🌅 新的一天開始時間</div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
        凌晨到此時間前開啟 App，仍算前一天（適合夜貓子）。
      </p>
      <div class="mode-row">
        <div class="mode-info">
          <div class="mode-name">起始時間</div>
          <div class="mode-desc">達此時間後才視為新的一天（預設 05:00）</div>
        </div>
        <select class="form-input" id="new-day-hour-select" style="width:90px;flex-shrink:0">
          ${[0,1,2,3,4,5,6,7,8].map(h =>
            `<option value="${h}" ${(state.user?.newDayHour ?? 5) === h ? 'selected' : ''}>${String(h).padStart(2,'0')}:00</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <!-- Tasks -->
    <div class="card">
      <div class="card-title">🎯 任務管理</div>
      <div id="tasks-list">${tasksHtml}</div>
      <button class="btn btn-primary" style="margin-top:12px" id="add-task-btn">+ 新增任務</button>
    </div>

    <!-- Leaderboard opt-in -->
    <div class="card">
      <div class="card-title">🏆 排行榜</div>
      <div class="mode-row">
        <div class="mode-info">
          <div class="mode-name">顯示於排行榜</div>
          <div class="mode-desc">${state.user?.isPublic
            ? '你的名字與分數已公開顯示在排行榜'
            : '目前不公開，不會出現在排行榜'}</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="public-toggle" ${state.user?.isPublic ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Pro subscription -->
    <div class="card pro-card" id="pro-card">
      <div class="pro-card-header">
        <span class="pro-card-icon">✦</span>
        <div>
          <div class="pro-card-title">Orbit Pro</div>
          <div class="pro-card-sub">解鎖進階功能，支持獨立開發</div>
        </div>
      </div>
      ${_proSectionHtml()}
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
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">版本 ${APP_VERSION}</div>
      <button class="btn btn-outline btn-sm" id="tour-btn" style="margin-bottom:10px;width:100%">重啟新手教學</button>
      <button class="btn-text-danger" id="reset-btn">清除本機快取資料（重新登入後可從雲端還原）</button>
    </div>
  `;

  _setupListeners(container);
}

// ── Listeners ────────────────────────────────────────────────────────────────
function _setupListeners(container) {
  // Random theme toggle
  container.querySelector('#random-theme-toggle')?.addEventListener('change', e => {
    const enabled = e.target.checked;
    storage.saveRandomThemeEnabled(enabled);
    if (enabled) {
      // Clear the saved date so applyRandomThemeForToday() picks a fresh theme now
      storage.saveRandomThemeDate('');
      applyRandomThemeForToday();
    }
    _renderView(container);
  });

  // Theme
  container.querySelectorAll('.theme-card:not([data-locked])').forEach(card => {
    card.addEventListener('click', () => {
      applyTheme(card.dataset.themeId);
      _renderView(container);
    });
  });
  container.querySelectorAll('.theme-card[data-locked]').forEach(card => {
    card.addEventListener('click', _goToProCard);
  });
  container.querySelector('#random-theme-lock')?.addEventListener('click', _goToProCard);

  // Background
  container.querySelector('#bg-upload-btn')?.addEventListener('click', () => {
    container.querySelector('#bg-input')?.click();
  });
  container.querySelector('#bg-input')?.addEventListener('change', async e => {
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
  container.querySelector('#mode-toggle')?.addEventListener('change', e => {
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

  // Focus sound toggle (Pro)
  container.querySelector('#focus-sound-toggle')?.addEventListener('change', e => {
    if (!state.user) return;
    state.user.focusSoundEnabled = e.target.checked;
    storage.upsertProfile(state.user);
  });

  // Focus default minutes (Pro)
  container.querySelector('#focus-default-min-select')?.addEventListener('change', e => {
    if (!state.user) return;
    state.user.focusDefaultMinutes = e.target.value ? Number(e.target.value) : null;
    storage.upsertProfile(state.user);
  });

  // New day hour
  container.querySelector('#new-day-hour-select')?.addEventListener('change', e => {
    if (!state.user) return;
    state.user.newDayHour = Number(e.target.value);
    storage.saveUser(state.user);
  });

  // Task CRUD
  container.querySelector('#add-task-btn')?.addEventListener('click', () => {
    _showTaskModal(container, null);
  });
  container.querySelector('#tasks-list')?.addEventListener('click', e => {
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

  // Leaderboard opt-in
  container.querySelector('#public-toggle')?.addEventListener('change', e => {
    if (!state.user) return;
    state.user.isPublic = e.target.checked;
    storage.saveUser(state.user);
    _renderView(container);
  });

  // Show account email async
  import('../auth.js').then(({ getSession }) => {
    getSession().then(session => {
      const el = container.querySelector('#account-email');
      if (!el) return;
      el.textContent = session?.user?.email || '（遊客）';
    });
  });

  // Restart tour
  container.querySelector('#tour-btn')?.addEventListener('click', () => {
    window.startTour();
  });

  // Feature info buttons → popover
  const FEAT_DETAILS_LABELS = [
    { icon: '∞', label: '完整歷史紀錄',
      detail: '免費版僅保留 30 天紀錄。Pro 永久保留所有打卡與 XP 歷程，讓你看見真實的成長曲線。' },
    { icon: '🛡️', label: 'Streak Shield',
      detail: '每月獲得 2 張保護卡。偶爾忘記打卡？用盾牌抵擋中斷，連勝不歸零。' },
    { icon: '📈', label: 'Habit Heatmap',
      detail: '完整熱力圖顯示全年每日活躍度。免費版僅 90 天。一眼看出哪幾週你最拼。' },
    { icon: '📤', label: 'CSV 匯出',
      detail: '一鍵匯出所有打卡紀錄為 CSV，可匯入 Excel / Notion 做進一步分析，資料永遠是你的。' },
  ];
  container.querySelectorAll('.pro-feat-info-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.feat);
      const feat = FEAT_DETAILS_LABELS[idx];
      if (!feat) return;
      _showFeatPopover(btn, feat);
    });
  });

  // Pro anchor + sheet
  container.querySelector('#pro-subscribe-yearly')?.addEventListener('click', () => {
    window.showToast('金流整合即將上線，敬請期待！');
  });
  container.querySelector('#pro-view-all')?.addEventListener('click', () => {
    _showProSheet();
  });

  // Expose so other pages (goals, review) can scroll to Pro section after navigating here
  window._scrollToProCard = () => {
    const card = document.getElementById('pro-card');
    if (!card) return;
    const content = document.getElementById('content');
    content?.scrollTo({ top: card.offsetTop - 16, behavior: 'smooth' });
    if (sessionStorage.getItem('orbit_pro_highlight') === '1') {
      sessionStorage.removeItem('orbit_pro_highlight');
      const flash = () => {
        card.classList.add('pro-card-highlight');
        setTimeout(() => card.classList.remove('pro-card-highlight'), 2000);
      };
      // Start flash after scroll settles; scrollend fires on completion, fallback after 600ms
      const fallback = setTimeout(flash, 600);
      content?.addEventListener('scrollend', () => { clearTimeout(fallback); flash(); }, { once: true });
    }
  };

  // Sign out
  container.querySelector('#signout-btn')?.addEventListener('click', () => {
    window.signOut();
  });

  // Clear local cache
  container.querySelector('#reset-btn')?.addEventListener('click', () => {
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
      const todayStr = today();
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
