import { state }                                              from './state.js';
import { storage, db, migrateV1toV2 }                        from './storage.js';
import { signInWithEmail, signOut, getSession, onAuthStateChange } from './auth.js';
import { getLevelInfo, getTitle }  from './leveling.js';
import {
  calcBaseXP, calcFinalXP, calcEnergyCost, calcEnergyGain,
  calcDailyStats, processStreakForDate, getDailyTaskXP,
  getDailyTaskCount, getMinEffectiveMinutes,
} from './engine.js';
import { uid, today }           from './utils.js';
import { createDefaultTasks }   from './defaultTasks.js';
import { renderHome }           from './pages/home.js';
import { renderGoals }          from './pages/goals.js';
import { renderReview }         from './pages/review.js';
import { renderProfile }        from './pages/profile.js';
import { renderSettings }       from './pages/settings.js';

// ─── Auth session state ───────────────────────────────────────────────────────
let _currentSession   = null;
let _loginListenerSet = false;

// ─── Router ──────────────────────────────────────────────────────────────────

const ROUTES = {
  home:     renderHome,
  goals:    renderGoals,
  review:   renderReview,
  profile:  renderProfile,
  settings: renderSettings,
};

function currentHash() { return window.location.hash.slice(1) || 'home'; }

function renderPage(hash) {
  const fn = ROUTES[hash] || renderHome;
  fn(document.getElementById('content'));
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === hash);
  });
}

window.navigate = function (page) { window.location.hash = '#' + page; };
window.addEventListener('hashchange', () => renderPage(currentHash()));

// ─── Header ──────────────────────────────────────────────────────────────────

export function updateHeader() {
  if (!state.user) return;
  const info = getLevelInfo(state.user.totalXP || 0);
  document.getElementById('hdr-level').textContent = info.level;
  document.getElementById('hdr-title').textContent = getTitle(info.level);
  document.getElementById('hdr-xp-fill').style.width = info.percent + '%';
  document.getElementById('hdr-xp-text').textContent = `${info.currentXP} / ${info.needed} XP`;
}

// ─── Energy helpers ──────────────────────────────────────────────────────────

export function getTodayEntertainmentMinutes() {
  const todayStr = today();
  return state.sessions
    .filter(s => s.date === todayStr && s.impactType === 'entertainment')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
}

/** Reset energy if we're on a new day. If morningState provided, set energy accordingly. */
export function resetEnergyIfNewDay(morningState) {
  const todayStr = today();
  if (state.energy.lastResetDate === todayStr) return;

  const energyMap = { good: 100, normal: 90, tired: 75 };
  const ms = morningState || state.user?.morningState || 'normal';
  state.energy.currentEnergy = energyMap[ms] ?? 90;
  state.energy.maxEnergy = 100;
  state.energy.lastResetDate = todayStr;
  storage.saveEnergy(state.energy);
}

// ─── Streak end-of-day processing ────────────────────────────────────────────

/** Check yesterday's stats and update streak (called once per day on launch). */
function processYesterdayStreak() {
  if (!state.user) return;
  const todayStr = today();
  if (state.user.lastStreakDate === todayStr) return;   // already processed today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  if (state.user.lastStreakDate === yStr) {
    // We had activity yesterday; check if it was effective
    const stats = calcDailyStats(state.sessions, yStr);
    state.user.streakDays = processStreakForDate(state.user.streakDays || 0, stats.isEffectiveDay);
  } else if (state.user.lastStreakDate && state.user.lastStreakDate < yStr) {
    // Missed a day(s) — apply penalty
    state.user.streakDays = Math.max(0, (state.user.streakDays || 0) - 2);
  }

  state.user.lastStreakDate = todayStr;
  storage.saveUser(state.user);
}

// ─── Instant task completion ─────────────────────────────────────────────────

window.completeInstant = function (taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !state.user) return;

  const todayStr = today();

  // Anti-grind: max 3 completions per task per day
  if (getDailyTaskCount(state.sessions, taskId, todayStr) >= 3) {
    showToast('今日此任務已達上限（3次）');
    return;
  }

  const baseXP    = calcBaseXP(task);
  let   finalXP   = calcFinalXP(baseXP, 'instant', state.user.streakDays || 0);
  const energyCost = calcEnergyCost(task);

  // B-class daily XP cap (100 XP/day)
  if (task.value === 'B') {
    const alreadyToday = getDailyTaskXP(state.sessions, taskId, todayStr);
    const taskCap = task.dailyXpCap ?? 100;
    if (alreadyToday >= taskCap) finalXP = 0;
    else finalXP = Math.min(finalXP, taskCap - alreadyToday);
  }

  // Energy: recovery/entertainment gain energy instead of costing
  let energyGain = 0;
  if (task.impactType !== 'task') {
    // For instant recovery/entertainment we use a flat 15-min bracket
    energyGain = calcEnergyGain(task, 15, getTodayEntertainmentMinutes());
  }

  const isProductiveXP = task.impactType === 'task' &&
    task.value !== 'D' && finalXP > 0;

  const session = {
    id:              uid(),
    taskId:          task.id,
    taskName:        task.name,
    taskEmoji:       task.emoji || '🎯',
    taskIconImg:     task.iconImg || null,
    date:            todayStr,
    startedAt:       new Date().toISOString(),
    completedAt:     new Date().toISOString(),
    durationMinutes: 0,
    result:          'instant',
    baseXP,
    finalXP,
    energyCost,
    energyGain,
    streakMultiplier: 1,
    impactType:      task.impactType,
    taskNature:      task.taskNature,
    value:           task.value,
    resistance:      task.resistance,
    isProductiveXP,
  };

  _commitSession(session, task);
};

// ─── Focus timer state ───────────────────────────────────────────────────────

const focus = {
  active:            false,
  taskId:            null,
  startTime:         null,
  elapsedSec:        0,
  intervalId:        null,
  minEffectiveSec:   0,
};

window.startFocus = function (taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (focus.active) return;

  focus.active          = true;
  focus.taskId          = taskId;
  focus.startTime       = Date.now();
  focus.elapsedSec      = 0;
  focus.minEffectiveSec = getMinEffectiveMinutes(task.difficulty) * 60;

  const overlay = document.getElementById('focus-overlay');
  document.getElementById('focus-task-name').textContent = task.name;
  document.getElementById('focus-task-emoji').textContent = task.emoji || '🎯';
  overlay.classList.remove('hidden');

  focus.intervalId = setInterval(_tickFocus, 1000);
  _tickFocus();
};

function _tickFocus() {
  focus.elapsedSec = Math.floor((Date.now() - focus.startTime) / 1000);
  const min = Math.floor(focus.elapsedSec / 60);
  const sec = focus.elapsedSec % 60;
  document.getElementById('focus-timer').textContent =
    `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  const minEl = document.getElementById('focus-min-effective');
  const minSec = focus.minEffectiveSec;
  if (focus.elapsedSec >= minSec) {
    minEl.textContent = '達到最低有效時間 ✓';
    minEl.className = 'focus-min-reached';
    document.getElementById('focus-end-btn').disabled = false;
  } else {
    const remain = minSec - focus.elapsedSec;
    const rm = Math.floor(remain / 60), rs = remain % 60;
    minEl.textContent = `最低有效時間：還需 ${rm}:${String(rs).padStart(2,'0')}`;
    minEl.className = 'focus-min-pending';
    document.getElementById('focus-end-btn').disabled = false; // allow early end, XP = 0
  }
}

window.endFocus = function () {
  if (!focus.active) return;
  clearInterval(focus.intervalId);

  const durationMin = Math.floor(focus.elapsedSec / 60);
  const isEffective = focus.elapsedSec >= focus.minEffectiveSec;

  document.getElementById('focus-overlay').classList.add('hidden');

  if (!isEffective) {
    // Below minimum: record as invalid session (no XP)
    _submitFocusResult('invalid', durationMin);
    return;
  }
  // Show result picker
  _showResultPicker(durationMin);
};

function _showResultPicker(durationMin) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'result-picker';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">這次專注如何？</span>
      </div>
      <div class="result-options">
        <button class="result-btn result-complete" data-result="complete">
          <span class="result-icon">✅</span>
          <span class="result-label">完成</span>
          <span class="result-desc">達成預定目標</span>
        </button>
        <button class="result-btn result-partial" data-result="partial">
          <span class="result-icon">🔶</span>
          <span class="result-label">部分完成</span>
          <span class="result-desc">進度推進但未完成</span>
        </button>
        <button class="result-btn result-invalid" data-result="invalid">
          <span class="result-icon">❌</span>
          <span class="result-label">無效投入</span>
          <span class="result-desc">大部分時間失焦</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('.result-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.remove();
      _submitFocusResult(btn.dataset.result, durationMin);
    });
  });
}

function _submitFocusResult(result, durationMin) {
  const task = state.tasks.find(t => t.id === focus.taskId);
  focus.active = false;

  if (!task || !state.user) return;

  const todayStr = today();
  const baseXP   = calcBaseXP(task);
  let   finalXP  = calcFinalXP(baseXP, result, state.user.streakDays || 0);

  // B-class daily XP cap
  if (task.value === 'B') {
    const alreadyToday = getDailyTaskXP(state.sessions, task.id, todayStr);
    const taskCap = task.dailyXpCap ?? 100;
    if (alreadyToday >= taskCap) finalXP = 0;
    else finalXP = Math.min(finalXP, taskCap - alreadyToday);
  }

  const energyCost  = result !== 'invalid' ? calcEnergyCost(task) : 0;
  const energyGain  = task.impactType !== 'task'
    ? calcEnergyGain(task, durationMin, getTodayEntertainmentMinutes())
    : 0;

  const isProductiveXP = task.impactType === 'task' &&
    task.value !== 'D' && finalXP > 0 && result !== 'invalid';

  const session = {
    id:              uid(),
    taskId:          task.id,
    taskName:        task.name,
    taskEmoji:       task.emoji || '🎯',
    taskIconImg:     task.iconImg || null,
    date:            todayStr,
    startedAt:       new Date(Date.now() - focus.elapsedSec * 1000).toISOString(),
    completedAt:     new Date().toISOString(),
    durationMinutes: durationMin,
    result,
    baseXP,
    finalXP,
    energyCost,
    energyGain,
    streakMultiplier: 1,
    impactType:      task.impactType,
    taskNature:      task.taskNature,
    value:           task.value,
    resistance:      task.resistance,
    isProductiveXP,
  };

  _commitSession(session, task);
}

// ─── Shared session commit ────────────────────────────────────────────────────

function _commitSession(session, task) {
  const oldLevel = getLevelInfo(state.user.totalXP || 0).level;

  // Persist session
  state.sessions.push(session);
  storage.saveSessions(state.sessions);

  // Update XP
  state.user.totalXP = (state.user.totalXP || 0) + session.finalXP;

  // Update energy
  if (session.energyCost > 0) {
    state.energy.currentEnergy = Math.max(0,
      state.energy.currentEnergy - session.energyCost);
  }
  if (session.energyGain > 0) {
    state.energy.currentEnergy = Math.min(state.energy.maxEnergy,
      state.energy.currentEnergy + session.energyGain);
  }
  storage.saveEnergy(state.energy);
  storage.saveUser(state.user);

  updateHeader();

  const xpLabel = session.finalXP > 0
    ? `+${session.finalXP} XP`
    : session.impactType === 'recovery'
      ? `+${session.energyGain} ⚡`
      : session.result === 'invalid'
        ? '無效 0 XP'
        : '完成';
  showXPFloat(xpLabel);

  renderPage(currentHash());

  const newLevel = getLevelInfo(state.user.totalXP).level;
  if (newLevel > oldLevel) {
    setTimeout(() => showLevelUp(newLevel, getTitle(newLevel)), 600);
  }
}

// ─── Morning state modal ─────────────────────────────────────────────────────

function showMorningModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'morning-modal';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span class="modal-title">☀️ 今天的狀態？</span></div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;text-align:center">
        這會決定今日初始精力值
      </p>
      <div class="morning-options">
        <button class="morning-btn" data-state="good">
          <span>😊</span><strong>充沛</strong><small>精力 100</small>
        </button>
        <button class="morning-btn" data-state="normal">
          <span>😐</span><strong>普通</strong><small>精力 90</small>
        </button>
        <button class="morning-btn" data-state="tired">
          <span>😴</span><strong>疲憊</strong><small>精力 75</small>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('.morning-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ms = btn.dataset.state;
      state.user.morningState = ms;
      storage.saveUser(state.user);
      modal.remove();
      resetEnergyIfNewDay(ms);
      renderPage(currentHash());
    });
  });
}

// ─── XP float animation ──────────────────────────────────────────────────────

export function showXPFloat(text) {
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
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

window.signOut = async function () {
  await signOut();   // triggers SIGNED_OUT → handleSignOut
};

// ─── Weekly consistency bonus (called once/week) ──────────────────────────────

function checkWeeklyBonus() {
  if (!state.user) return;
  const todayStr = today();
  const d = new Date(todayStr + 'T00:00:00');
  // Only check on Monday (day 1)
  if (d.getDay() !== 1) return;
  if (state.user.lastWeeklyBonusDate === todayStr) return;

  // Count effective days in the last 7 days
  let effectiveDays = 0;
  for (let i = 1; i <= 7; i++) {
    const dd = new Date(d); dd.setDate(dd.getDate() - i);
    const ds = dd.toISOString().slice(0, 10);
    const stats = calcDailyStats(state.sessions, ds);
    if (stats.isEffectiveDay) effectiveDays++;
  }

  if (effectiveDays >= 5) {
    state.user.totalXP = (state.user.totalXP || 0) + 60;
    state.user.lastWeeklyBonusDate = todayStr;
    storage.saveUser(state.user);
    updateHeader();
    showXPFloat('+60 XP 週一致性獎勵！');
  }
}

// ─── Setup screen ────────────────────────────────────────────────────────────

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

    state.user = {
      id: _currentSession?.user?.id || uid(), name, avatar: avatarData, totalXP: 0,
      streakDays: 0, lastStreakDate: '', lastWeeklyBonusDate: '',
      morningState: 'normal', createdAt: today(),
    };
    storage.saveUser(state.user);

    if (state.tasks.length === 0) {
      state.tasks = createDefaultTasks();
      storage.saveTasks(state.tasks);
    }

    showMainApp();
    // Ask morning state on first day
    showMorningModal();
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
    document.body.style.backgroundSize  = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    html.classList.add('has-bg');
  } else {
    document.body.style.backgroundImage = '';
    html.classList.remove('has-bg');
  }
}

// ─── Login screen ────────────────────────────────────────────────────────────

function hideLoading() {
  document.getElementById('loading-screen').classList.add('hidden');
}

function showLoginScreen() {
  hideLoading();
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');

  if (_loginListenerSet) return;
  _loginListenerSet = true;

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const btn   = e.target.querySelector('button[type=submit]');
    btn.disabled    = true;
    btn.textContent = '發送中…';

    const error = await signInWithEmail(email);
    if (error) {
      btn.disabled    = false;
      btn.textContent = '發送登入連結';
      showToast('發送失敗：' + (error.message || '請稍後再試'));
    } else {
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('login-sent').classList.remove('hidden');
    }
  });
}

async function loadAndStart(session) {
  _currentSession = session;

  // Pull fresh data from Supabase; fall back to localStorage cache if offline
  try {
    await db.loadFromRemote(session.user.id);
  } catch (e) {
    console.warn('Supabase load failed, using localStorage cache:', e);
  }

  state.user     = storage.getUser();
  state.tasks    = storage.getTasks();
  state.sessions = storage.getSessions();
  state.energy   = storage.getEnergy();

  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');

  if (!state.tasks.length) {
    // New user: no tasks yet — show setup to customise profile + seed defaults
    showSetup();
  } else {
    processYesterdayStreak();
    if (state.energy.lastResetDate !== today()) {
      showMainApp();
      showMorningModal();
    } else {
      showMainApp();
    }
    checkWeeklyBonus();
  }
}

function handleSignOut() {
  _currentSession   = null;
  _loginListenerSet = false;
  state.user     = null;
  state.tasks    = [];
  state.sessions = [];
  state.energy   = { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' };
  storage.clearAll();

  // Reset login form to initial state
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('login-sent').classList.add('hidden');
  const emailEl = document.getElementById('login-email');
  if (emailEl) emailEl.value = '';

  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('setup-screen').classList.add('hidden');
  showLoginScreen();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  migrateV1toV2(today());
  document.documentElement.setAttribute('data-theme', storage.getTheme());
  _renderBg(storage.getBgImage());

  // Listen for future auth changes (magic-link redirects, sign-outs)
  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !_currentSession) {
      await loadAndStart(session);
    } else if (event === 'SIGNED_OUT') {
      handleSignOut();
    }
  });

  const session = await getSession();
  if (session) {
    await loadAndStart(session);
  } else {
    showLoginScreen();
  }
}

init();
