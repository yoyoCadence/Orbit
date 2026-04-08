import { state } from './state.js';
import { storage } from './storage.js';
import { getLevelInfo, getTitle } from './leveling.js';
import { uid, today } from './utils.js';
import { renderHome } from './pages/home.js';
import { renderGoals } from './pages/goals.js';
import { renderProfile } from './pages/profile.js';
import { renderSettings } from './pages/settings.js';

// ─── Router ──────────────────────────────────────────────────────────────────

const ROUTES = { home: renderHome, goals: renderGoals, profile: renderProfile, settings: renderSettings };

function currentHash() { return window.location.hash.slice(1) || 'home'; }

function renderPage(hash) {
  const fn = ROUTES[hash] || renderHome;
  fn(document.getElementById('content'));
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === hash);
  });
}

window.navigate = function (page) {
  window.location.hash = '#' + page;
};
window.addEventListener('hashchange', () => renderPage(currentHash()));

// ─── Header ──────────────────────────────────────────────────────────────────

function updateHeader() {
  if (!state.user) return;
  const info = getLevelInfo(state.user.totalXP || 0);
  document.getElementById('hdr-level').textContent = info.level;
  document.getElementById('hdr-title').textContent = getTitle(info.level);
  document.getElementById('hdr-xp-fill').style.width = info.percent + '%';
  document.getElementById('hdr-xp-text').textContent = `${info.currentXP} / ${info.needed} XP`;
}

// ─── Log a goal completion ────────────────────────────────────────────────────

window.logGoal = function (goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal || !state.user) return;

  const oldLevel = getLevelInfo(state.user.totalXP || 0).level;

  // Create log entry
  const log = {
    id: uid(),
    goalId: goal.id,
    goalName: goal.name,
    goalEmoji: goal.emoji,
    goalIconImg: goal.iconImg || null,
    xp: goal.xp,
    date: today(),
    completedAt: new Date().toISOString(),
  };
  state.logs.push(log);
  storage.saveLogs(state.logs);

  // Add XP
  state.user.totalXP = (state.user.totalXP || 0) + goal.xp;
  storage.saveUser(state.user);

  // Update header
  updateHeader();

  // Floating XP notification
  showXPFloat(`+${goal.xp} XP`);

  // Re-render current page
  renderPage(currentHash());

  // Level up check (delayed so page renders first)
  const newLevel = getLevelInfo(state.user.totalXP).level;
  if (newLevel > oldLevel) {
    setTimeout(() => showLevelUp(newLevel, getTitle(newLevel)), 600);
  }
};

// ─── XP float animation ──────────────────────────────────────────────────────

function showXPFloat(text) {
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

// ─── Level-up overlay ────────────────────────────────────────────────────────

function showLevelUp(level, title) {
  document.getElementById('lu-level').textContent = level;
  document.getElementById('lu-title').textContent = title;
  document.getElementById('levelup-overlay').classList.remove('hidden');
}

window.closeLevelUp = function () {
  document.getElementById('levelup-overlay').classList.add('hidden');
};

// ─── Setup screen (first launch) ─────────────────────────────────────────────

function showSetup() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  let avatarData = null;

  document.getElementById('setup-avatar-btn').addEventListener('click', () => {
    document.getElementById('setup-avatar-input').click();
  });

  document.getElementById('setup-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      avatarData = ev.target.result;
      const preview = document.getElementById('setup-avatar-preview');
      preview.style.cssText += `;background-image:url(${avatarData});background-size:cover;background-position:center`;
      preview.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('setup-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('setup-name').value.trim();
    if (!name) return;

    state.user = { id: uid(), name, avatar: avatarData, totalXP: 0, createdAt: today() };
    storage.saveUser(state.user);

    // Seed default goals
    if (state.goals.length === 0) {
      state.goals = [
        { id: uid(), name: '運動健身', emoji: '🏋️', xp: 100 },
        { id: uid(), name: '閱讀學習', emoji: '📚', xp: 100 },
        { id: uid(), name: '早睡早起', emoji: '🌙', xp: 100 },
        { id: uid(), name: '健康飲食', emoji: '🥗', xp: 100 },
        { id: uid(), name: '專注工作', emoji: '💻', xp: 100 },
      ];
      storage.saveGoals(state.goals);
    }

    showMainApp();
  });
}

function showMainApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateHeader();
  renderPage(currentHash());
}

// ─── Theme & Background ───────────────────────────────────────────────────────

export function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  storage.saveTheme(themeId);
}

export function applyBgImage(dataUrl) {
  storage.saveBgImage(dataUrl);
  _renderBg(dataUrl);
}

export function removeBgImage() {
  storage.saveBgImage(null);
  _renderBg(null);
}

function _renderBg(dataUrl) {
  const html = document.documentElement;
  if (dataUrl) {
    document.body.style.backgroundImage = `url(${dataUrl})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    html.classList.add('has-bg');
  } else {
    document.body.style.backgroundImage = '';
    html.classList.remove('has-bg');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  state.user  = storage.getUser();
  state.goals = storage.getGoals();
  state.logs  = storage.getLogs();

  // Restore theme & background
  document.documentElement.setAttribute('data-theme', storage.getTheme());
  _renderBg(storage.getBgImage());

  if (state.user) {
    showMainApp();
  } else {
    showSetup();
  }
}

init();
