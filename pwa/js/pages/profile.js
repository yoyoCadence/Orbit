import { state } from '../state.js';
import { storage } from '../storage.js';
import { getLevelInfo, getTitle, xpTable } from '../leveling.js';
import { today } from '../utils.js';

export function renderProfile(container) {
  const user = state.user;
  if (!user) return;

  const info = getLevelInfo(user.totalXP || 0);
  const title = getTitle(info.level);
  const totalTasks = state.logs.length;

  const joined = new Date(user.createdAt + 'T00:00:00');
  const daysActive = Math.max(1, Math.ceil((Date.now() - joined.getTime()) / 86400000));

  // Unique days with at least 1 log
  const activeDays = new Set(state.logs.map(l => l.date)).size;

  const avatarContent = user.avatar
    ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="avatar">`
    : `<span style="font-size:40px">👤</span>`;

  // XP table for next levels
  const tableRows = xpTable(info.level, 6).map(r => `
    <div class="xp-table-row ${r.from === info.level ? 'current-level' : ''}">
      <span>Lv.${r.from} → ${r.to}</span>
      <span>${r.from === info.level ? `${info.currentXP} / ` : ''}${r.xp} XP</span>
    </div>
  `).join('');

  const isNewbie = info.level <= 30;

  container.innerHTML = `
    <!-- Avatar + Name -->
    <div class="profile-top">
      <div class="avatar-wrap" id="avatar-wrap">
        <div class="avatar-circle">${avatarContent}</div>
        <div class="avatar-edit-badge">✏️</div>
      </div>
      <input type="file" id="avatar-input" accept="image/*" style="display:none">

      <div class="profile-name" id="profile-name-display">
        ${escHtml(user.name)}
        <span class="edit-hint">✏️</span>
      </div>
      <div class="profile-joined">加入於 ${user.createdAt}</div>
    </div>

    <!-- Level card -->
    <div class="card level-card">
      <div class="level-big">${info.level}</div>
      <div class="level-title-text">${title}</div>
      ${isNewbie ? `<div class="newbie-badge">🌱 新手期 · 每完成一項任務即可升一等</div>` : ''}
      <div class="xp-bar-label">
        <span>升級進度</span>
        <span>${info.currentXP} / ${info.needed} XP</span>
      </div>
      <div class="xp-bar-track">
        <div class="xp-bar-fill" style="width:${info.percent}%"></div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${user.totalXP || 0}</div>
        <div class="stat-label">累計 XP</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalTasks}</div>
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
      ${tableRows}
      <div class="xp-table-note">
        ${isNewbie
          ? '前 30 等：每等僅需 100 XP，完成一項預設任務即可升等！'
          : '30 等後難度指數成長，持續挑戰吧！'}
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
    };
    reader.readAsDataURL(file);
  });

  // Edit name
  document.getElementById('profile-name-display').addEventListener('click', () => {
    showNameModal(container);
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
  input.focus();
  input.select();

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

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
