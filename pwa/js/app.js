import { state }                                              from './state.js';
import { storage, db, migrateV1toV2, migrateDefaultFlags }    from './storage.js';
import { signIn, signUp, signInWithGoogle, signOut as authSignOut, getSession, onAuthStateChange } from './auth.js';
import { getLevelInfo, getDisplayTitle } from './leveling.js';
import {
  calcBaseXP, calcFinalXP, calcEnergyCost, calcEnergyGain,
  calcDailyStats, processStreakForDate, getDailyTaskXP,
  getDailyTaskCount, getMinEffectiveMinutes,
} from './engine.js';
import { uid, today, effectiveToday } from './utils.js';

/** Effective date for session recording — respects user's newDayHour threshold. */
function _eToday() { return effectiveToday(state.user?.newDayHour ?? 5); }
import { createDefaultTasks }   from './defaultTasks.js';
import { renderHome }           from './pages/home.js';
import { renderGoals }          from './pages/goals.js';
import { renderReview }         from './pages/review.js';
import { renderProfile }        from './pages/profile.js';
import { renderSettings }       from './pages/settings.js';
import { renderLeaderboard }    from './pages/leaderboard.js';
import { startTour } from './tour.js';

// ─── Version ─────────────────────────────────────────────────────────────────
export const APP_VERSION = 'v1.15.0';

// Expose tour globally so settings page can call it
window.startTour = startTour;

// ─── Auth session state ───────────────────────────────────────────────────────
let _currentSession   = null;
let _isGuest          = false;
let _loginListenerSet = false;

// ─── Router ──────────────────────────────────────────────────────────────────

const ROUTES = {
  home:        renderHome,
  goals:       renderGoals,
  review:      renderReview,
  profile:     renderProfile,
  settings:    renderSettings,
  leaderboard: renderLeaderboard,
};

function currentHash() { return window.location.hash.slice(1) || 'home'; }

// ─── Page slide animation + dot indicator ─────────────────────────────────────

const PAGE_ORDER = ['home', 'goals', 'review', 'profile', 'leaderboard', 'settings'];
let _prevPageIdx = -1;   // -1 = first render, skip animation


function renderPage(hash) {
  const fn      = ROUTES[hash] || renderHome;
  const content = document.getElementById('content');

  fn(content);

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === hash);
  });

  // Slide animation — skip on first render
  const newIdx = PAGE_ORDER.indexOf(hash);
  if (_prevPageIdx !== -1 && newIdx !== _prevPageIdx) {
    const cls = newIdx > _prevPageIdx ? 'page-slide-left' : 'page-slide-right';
    content.classList.remove('page-slide-left', 'page-slide-right');
    void content.offsetWidth;   // force reflow so re-adding the class re-triggers
    content.classList.add(cls);
    content.addEventListener('animationend', () => content.classList.remove(cls), { once: true });
  }
  _prevPageIdx = newIdx === -1 ? 0 : newIdx;

}

window.navigate = function (page) { window.location.hash = '#' + page; };
window.addEventListener('hashchange', () => renderPage(currentHash()));

// ─── Swipe navigation ─────────────────────────────────────────────────────────

let _swipeStartX = 0, _swipeStartY = 0;

document.addEventListener('touchstart', e => {
  _swipeStartX = e.touches[0].clientX;
  _swipeStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', e => {
  if (window._isDragging) return;
  const dx = e.changedTouches[0].clientX - _swipeStartX;
  const dy = e.changedTouches[0].clientY - _swipeStartY;
  // Only trigger for clearly horizontal swipes (not vertical scrolling)
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.75) return;
  const hash = currentHash();
  const idx  = PAGE_ORDER.indexOf(hash);
  if (idx === -1) return;
  if (dx < 0 && idx < PAGE_ORDER.length - 1) window.navigate(PAGE_ORDER[idx + 1]);
  else if (dx > 0 && idx > 0) window.navigate(PAGE_ORDER[idx - 1]);
}, { passive: true });

// ─── Daily Plan ───────────────────────────────────────────────────────────────

window.addToDailyPlan = function (taskId) {
  if (state.dailyPlan.includes(taskId)) {
    showToast('任務已在計劃中');
    return;
  }
  state.dailyPlan.push(taskId);
  storage.saveDailyPlan(state.dailyPlan);
  showToast('✓ 已加入本日計劃');
  renderPage(currentHash());
};

window.removeFromDailyPlan = function (taskId) {
  state.dailyPlan = state.dailyPlan.filter(id => id !== taskId);
  storage.saveDailyPlan(state.dailyPlan);
  renderPage(currentHash());
};

// ─── Header ──────────────────────────────────────────────────────────────────

export function updateHeader() {
  if (!state.user) return;
  const info = getLevelInfo(state.user.totalXP || 0);

  // Avatar
  const avatarEl = document.getElementById('hdr-avatar');
  if (avatarEl) {
    if (state.user.avatar) {
      avatarEl.innerHTML = `<img src="${state.user.avatar}" alt="avatar">`;
    } else {
      avatarEl.textContent = (state.user.name?.[0] || '?').toUpperCase();
    }
  }

  document.getElementById('hdr-level').textContent = `Lv.${info.level}`;
  document.getElementById('hdr-title').textContent = getDisplayTitle(info.level, state.user);
  document.getElementById('hdr-xp-fill').style.width = info.percent + '%';
  document.getElementById('hdr-xp-text').textContent = `${info.currentXP} / ${info.needed} XP`;

  // Energy bar
  const energy = state.energy;
  const energyPct = Math.round((energy.currentEnergy / (energy.maxEnergy || 100)) * 100);
  const fill = document.getElementById('hdr-energy-fill');
  const txt  = document.getElementById('hdr-energy-text');
  if (fill) {
    fill.style.width = energyPct + '%';
    fill.className = 'energy-bar-fill' +
      (energyPct >= 60 ? ' energy-high' : energyPct >= 30 ? ' energy-mid' : ' energy-low');
  }
  if (txt) txt.textContent = energy.currentEnergy;
}

// ─── Energy helpers ──────────────────────────────────────────────────────────

export function getTodayEntertainmentMinutes() {
  const todayStr = _eToday();
  return state.sessions
    .filter(s => s.date === todayStr && s.impactType === 'entertainment')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
}

/** Reset energy if we're on a new day. If morningState provided, set energy accordingly. */
export function resetEnergyIfNewDay(morningState) {
  const todayStr = _eToday();
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
  const todayStr = _eToday();
  if (state.user.lastStreakDate === todayStr) return;   // already processed today

  // Monthly reset of streak shields (Pro only)
  const currentMonth = todayStr.slice(0, 7);
  if (storage.isProUser() && (state.user.streakShieldResetMonth || '') !== currentMonth) {
    state.user.streakShieldCount = 2;
    state.user.streakShieldResetMonth = currentMonth;
  }

  const d = new Date();
  if (d.getHours() < (state.user.newDayHour ?? 5)) d.setDate(d.getDate() - 1);
  const yesterday = new Date(d);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toLocaleDateString('sv');

  if (state.user.lastStreakDate === yStr) {
    // We had activity yesterday; check if it was effective
    const stats = calcDailyStats(state.sessions, yStr);
    state.user.streakDays = processStreakForDate(state.user.streakDays || 0, stats.isEffectiveDay);
  } else if (state.user.lastStreakDate && state.user.lastStreakDate < yStr) {
    // Missed a day(s) — streak resets to 0; offer shield to Pro users
    const prevStreak = state.user.streakDays || 0;
    state.user.streakDays = 0;
    if (storage.isProUser() && (state.user.streakShieldCount || 0) > 0 && prevStreak >= 2) {
      localStorage.setItem('orbit_shield_pending', JSON.stringify({ prevStreak }));
    }
  }

  // SUB-16: 45-day streak → 30-day free Pro (granted once per account)
  if (
    state.user.streakDays >= 45 &&
    !storage.isProUser() &&
    !storage.isTrialUser() &&
    !state.user.streakUnlockUsed
  ) {
    state.user.isPro           = true;
    state.user.proExpiresAt    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    state.user.streakUnlockUsed = true;
    sessionStorage.setItem('orbit_streak_unlock_new', '1');
  }

  state.user.lastStreakDate = todayStr;
  storage.saveUser(state.user);
}

// ─── Streak Shield ────────────────────────────────────────────────────────────

window.useStreakShield = function () {
  const raw = localStorage.getItem('orbit_shield_pending');
  if (!raw || !state.user) return;
  if (!storage.isProUser()) return;
  const { prevStreak } = JSON.parse(raw);
  state.user.streakDays = prevStreak;
  state.user.streakShieldCount = Math.max(0, (state.user.streakShieldCount || 0) - 1);
  localStorage.removeItem('orbit_shield_pending');
  sessionStorage.removeItem('orbit_shield_dismissed');
  storage.saveUser(state.user);
  db.upsertProfile(state.user);
  renderPage(currentHash());
  showToast(`🛡 保護卡使用成功！連勝紀錄維持 ${prevStreak} 天 🔥`);
};

window.dismissStreakShield = function () {
  // Show custom confirm —放棄後 pending 仍保留，讓使用者可從 🛡 pill 重新使用
  const overlay = document.createElement('div');
  overlay.className = 'shield-confirm-overlay';
  overlay.innerHTML = `
    <div class="shield-confirm-box">
      <div class="shield-confirm-title">確定放棄保護卡？</div>
      <div class="shield-confirm-sub">放棄後仍可點連勝區的 🛡 重新使用</div>
      <div class="shield-confirm-btns">
        <button class="shield-confirm-cancel" onclick="this.closest('.shield-confirm-overlay').remove()">取消</button>
        <button class="shield-confirm-ok" id="shield-confirm-ok-btn">確定放棄</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#shield-confirm-ok-btn').onclick = () => {
    overlay.remove();
    sessionStorage.setItem('orbit_shield_dismissed', '1');
    renderPage(currentHash());
  };
};

window.reshowShieldBanner = function () {
  sessionStorage.removeItem('orbit_shield_dismissed');
  sessionStorage.setItem('orbit_shield_scroll_top', '1');
  window.navigate('home');
};

window.showShieldInfo = function (anchor) {
  document.querySelectorAll('.shield-info-popover').forEach(el => el.remove());
  const pop = document.createElement('div');
  pop.className = 'shield-info-popover';
  pop.innerHTML = `
    <div class="shield-info-title">🛡 連勝保護卡</div>
    <div class="shield-info-body">連勝中斷時可消耗 1 張，<br>恢復中斷前的天數。</div>
    <div class="shield-info-body">每月自動重置為 2 張。</div>
    <div class="shield-info-pro">✦ Pro 專屬功能</div>
  `;
  const rect = anchor.getBoundingClientRect();
  pop.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${Math.max(8, rect.left - 100)}px;z-index:9999`;
  document.body.appendChild(pop);
  setTimeout(() => document.addEventListener('click', function h() {
    pop.remove(); document.removeEventListener('click', h);
  }), 10);
};

// ─── Streak unlock celebration modal (SUB-16) ─────────────────────────────────

function showStreakUnlockModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'streak-unlock-modal';
  modal.innerHTML = `
    <div class="modal-box" style="text-align:center">
      <div class="su-icon">🏆</div>
      <div class="su-title">45天連勝達成！</div>
      <div class="su-body">你的堅持獲得了回報！<br>解鎖 <strong>30天免費 Pro</strong>！</div>
      <div class="su-perks">
        <div class="su-perk">🛡 每月 2 張 Streak Shield</div>
        <div class="su-perk">📊 完整 Habit Heatmap</div>
        <div class="su-perk">📈 進階數據儀表板</div>
        <div class="su-perk" style="opacity:0.6">✦ 還有 Pro 專屬隱藏福利，升級後自行發現</div>
      </div>
      <button class="btn btn-primary su-btn" id="su-close-btn">🎉 太棒了！</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('su-close-btn').addEventListener('click', () => {
    modal.remove();
    renderPage(currentHash());
  });
}

// ─── Instant task completion ─────────────────────────────────────────────────

window.completeInstant = function (taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !state.user) return;

  const todayStr = _eToday();

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
  paused:            false,
  pausedAt:          null,
};

const SKIP_MESSAGES = [
  '成長是對自己的負責，確定已完成任務？',
  '誠實是成長的起點，你真的完成了嗎？',
  '記錄的是習慣，不是數字，確認已完成？',
  '你的未來自我會感謝今天的誠實，確定完成了？',
  '只有自己知道答案，確定已完成任務？',
];

window.startFocus = function (taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (focus.active) {
    showToast('⚡ 已有任務進行中，請先完成或略過');
    return;
  }

  if (storage.isProUser()) {
    _showDurationPicker(taskId, task);
  } else {
    _launchFocus(taskId, task, null);
  }
};

function _showDurationPicker(taskId, task) {
  const picker = document.getElementById('focus-duration-picker');
  const defaultMin = state.user?.focusDefaultMinutes ?? null;
  const customInput = document.getElementById('focus-dur-custom');

  // Highlight saved default
  picker.querySelectorAll('.focus-dur-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.min) === defaultMin);
  });
  if (defaultMin && !picker.querySelector(`.focus-dur-btn[data-min="${defaultMin}"]`)) {
    customInput.value = defaultMin;
  } else {
    customInput.value = '';
  }

  picker.classList.remove('hidden');

  function getSelectedMin() {
    const active = picker.querySelector('.focus-dur-btn.active');
    if (active) return Number(active.dataset.min);
    const v = parseInt(customInput.value, 10);
    return (!isNaN(v) && v > 0) ? v : null;
  }

  picker.querySelectorAll('.focus-dur-btn').forEach(btn => {
    btn.onclick = () => {
      picker.querySelectorAll('.focus-dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customInput.value = '';
    };
  });

  document.getElementById('focus-dur-confirm').onclick = () => {
    const min = getSelectedMin();
    picker.classList.add('hidden');
    if (min) {
      state.user.focusDefaultMinutes = min;
      storage.upsertProfile(state.user);
    }
    _launchFocus(taskId, task, min ?? null);
  };

  document.getElementById('focus-dur-skip').onclick = () => {
    picker.classList.add('hidden');
    _launchFocus(taskId, task, null);
  };
}

function _launchFocus(taskId, task, targetMin) {
  focus.active          = true;
  focus.taskId          = taskId;
  focus.startTime       = Date.now();
  focus.elapsedSec      = 0;
  focus.targetSec       = targetMin ? targetMin * 60 : null;
  focus.minEffectiveSec = getMinEffectiveMinutes(task.difficulty) * 60;

  document.getElementById('focus-task-name').textContent = task.name;
  document.getElementById('focus-task-emoji').textContent = task.emoji || '🎯';

  const modeEl = document.getElementById('focus-timer-mode');
  if (focus.targetSec) {
    modeEl.textContent = `目標 ${targetMin} 分鐘`;
    modeEl.className = 'focus-timer-mode focus-timer-mode--countdown';
  } else {
    modeEl.textContent = '';
    modeEl.className = 'focus-timer-mode';
  }

  document.getElementById('focus-overlay').classList.remove('hidden');
  focus.intervalId = setInterval(_tickFocus, 1000);
  _tickFocus();
}

function _tickFocus() {
  focus.elapsedSec = Math.floor((Date.now() - focus.startTime) / 1000);

  // Countdown mode: auto-end when target reached
  if (focus.targetSec && focus.elapsedSec >= focus.targetSec) {
    clearInterval(focus.intervalId);
    document.getElementById('focus-timer').textContent = '00:00';
    document.getElementById('focus-overlay').classList.add('hidden');
    document.getElementById('focus-pip').classList.add('hidden');
    _playFocusChime('end');
    _showResultPicker(Math.floor(focus.targetSec / 60));
    return;
  }

  let displaySec, timeStr;
  if (focus.targetSec) {
    displaySec = focus.targetSec - focus.elapsedSec;
    const min = Math.floor(displaySec / 60);
    const sec = displaySec % 60;
    timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  } else {
    const min = Math.floor(focus.elapsedSec / 60);
    const sec = focus.elapsedSec % 60;
    timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  document.getElementById('focus-timer').textContent = timeStr;

  const pipTimer = document.getElementById('focus-pip-timer');
  if (pipTimer) pipTimer.textContent = timeStr;

  const minEl = document.getElementById('focus-min-effective');
  const minSec = focus.minEffectiveSec;
  const justReached = focus.elapsedSec === minSec;
  if (focus.elapsedSec >= minSec) {
    if (justReached) _playFocusChime('milestone');
    minEl.textContent = '達到最低有效時間 ✓';
    minEl.className = 'focus-min-reached';
    document.getElementById('focus-end-btn').disabled = false;
  } else {
    const remain = minSec - focus.elapsedSec;
    const rm = Math.floor(remain / 60), rs = remain % 60;
    minEl.textContent = `最低有效時間：還需 ${rm}:${String(rs).padStart(2,'0')}`;
    minEl.className = 'focus-min-pending';
    document.getElementById('focus-end-btn').disabled = false;
  }
}

function _playFocusChime(type) {
  if (!storage.isProUser() || state.user?.focusSoundEnabled === false) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = type === 'end' ? [528, 660, 784] : [528, 660];
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.25);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 1.2);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 1.2);
    });
  } catch { /* AudioContext not available */ }
}

window.endFocus = function () {
  if (!focus.active) return;

  const isEffective = focus.elapsedSec >= focus.minEffectiveSec;

  if (!isEffective) {
    // Show confirmation before recording invalid (timer keeps running behind modal)
    _showEarlyEndConfirm();
    return;
  }

  clearInterval(focus.intervalId);
  document.getElementById('focus-overlay').classList.add('hidden');
  document.getElementById('focus-pip').classList.add('hidden');
  _showResultPicker(Math.floor(focus.elapsedSec / 60));
};

/** 縮小 overlay，timer 繼續在背景跑。 */
window.minimizeFocus = function () {
  if (!focus.active) return;
  const task = state.tasks.find(t => t.id === focus.taskId);
  document.getElementById('focus-pip-emoji').textContent = task?.emoji || '🎯';
  document.getElementById('focus-overlay').classList.add('hidden');
  document.getElementById('focus-pip').classList.remove('hidden');
};

/** 從背景恢復 overlay。 */
window.restoreFocus = function () {
  document.getElementById('focus-pip').classList.add('hidden');
  document.getElementById('focus-overlay').classList.remove('hidden');
};

/** 暫停 / 繼續切換。暫停時停止計時；繼續時補償 startTime。 */
window.togglePauseFocus = function () {
  if (!focus.active) return;
  const btn = document.getElementById('focus-pause-btn');
  if (focus.paused) {
    // 繼續：把暫停的時間長度加回 startTime，避免計入暫停秒數
    focus.startTime += Date.now() - focus.pausedAt;
    focus.pausedAt = null;
    focus.paused = false;
    focus.intervalId = setInterval(_tickFocus, 1000);
    if (btn) btn.textContent = '⏸ 暫停';
  } else {
    // 暫停
    clearInterval(focus.intervalId);
    focus.pausedAt = Date.now();
    focus.paused = true;
    if (btn) btn.textContent = '▶ 繼續';
  }
};

const MOTIVATIONAL_QUOTES = [
  '再撐一下，大腦需要足夠時間進入心流！',
  '困難往往在最後幾分鐘，堅持就是突破！',
  '每一分鐘的投入都在重塑你的大腦神經迴路。',
  '真正的成長發生在你想放棄的那一刻之後。',
  '差一點就達標了，未來的你會感謝你留下來。',
  '最後衝刺往往是最有價值的部分。',
];

function _showEarlyEndConfirm() {
  const minMin  = Math.ceil(focus.minEffectiveSec / 60);
  const quote   = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

  const modal   = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'early-end-confirm';
  modal.innerHTML = `
    <div class="modal-box" style="text-align:center">
      <div style="font-size:36px;margin-bottom:12px">⏱️</div>
      <p style="font-weight:600;margin-bottom:6px">未達最低時長（${minMin} 分鐘）</p>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">結束後本次不會累積 XP</p>
      <div class="motivational-quote">"${quote}"</div>
      <div class="skip-confirm-actions" style="margin-top:20px">
        <button class="btn btn-primary" id="early-keep-going">繼續加油 💪</button>
        <button class="btn btn-outline" id="early-end-confirm-btn">確定結束</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.zIndex = '200';

  modal.querySelector('#early-keep-going').addEventListener('click', () => modal.remove());

  modal.querySelector('#early-end-confirm-btn').addEventListener('click', () => {
    modal.remove();
    clearInterval(focus.intervalId);
    const dur = Math.floor(focus.elapsedSec / 60);
    document.getElementById('focus-overlay').classList.add('hidden');
    document.getElementById('focus-pip').classList.add('hidden');
    _submitFocusResult('invalid', dur);
  });
}

/** 略過：已在 app 外完成任務後補打卡。顯示確認語 + 時長選擇器。 */
window.skipFocus = function () {
  if (!focus.active) return;
  const msg = SKIP_MESSAGES[Math.floor(Math.random() * SKIP_MESSAGES.length)];

  // Preset durations (minutes); default to nearest preset ≥ minEffectiveSec
  const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
  const minMin    = Math.ceil(focus.minEffectiveSec / 60);
  let selected    = DURATIONS.find(d => d >= minMin) || DURATIONS[DURATIONS.length - 1];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'skip-confirm';
  modal.innerHTML = `
    <div class="modal-box" style="text-align:center">
      <div style="font-size:36px;margin-bottom:14px">🌱</div>
      <p class="skip-confirm-msg">${msg}</p>
      <div class="skip-duration-section">
        <p class="skip-duration-label">選擇已完成的時長</p>
        <div class="skip-duration-pills">
          ${DURATIONS.map(m => {
            const label = m >= 60 ? `${m / 60}h` : `${m}m`;
            return `<button class="skip-dur-btn${m === selected ? ' active' : ''}" data-min="${m}">${label}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="skip-confirm-actions">
        <button class="btn btn-primary" id="skip-yes">確認完成</button>
        <button class="btn btn-outline" id="skip-no">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.zIndex = '200'; // must be above focus-overlay (z-index:80)

  modal.querySelectorAll('.skip-dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.skip-dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selected = parseInt(btn.dataset.min, 10);
    });
  });

  modal.querySelector('#skip-yes').addEventListener('click', () => {
    modal.remove();
    clearInterval(focus.intervalId);
    document.getElementById('focus-overlay').classList.add('hidden');
    document.getElementById('focus-pip').classList.add('hidden');
    _submitFocusResult('complete', selected);
  });
  modal.querySelector('#skip-no').addEventListener('click', () => modal.remove());
};

function _showResultPicker(durationMin) {
  const isPro = storage.isProUser();
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
      ${isPro ? `
      <div class="focus-note-row">
        <textarea id="focus-note-input" class="focus-note-input"
          placeholder="備注這次專注…（選填）" maxlength="200" rows="2"></textarea>
      </div>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('.result-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = isPro ? (modal.querySelector('#focus-note-input')?.value.trim() || '') : '';
      modal.remove();
      _submitFocusResult(btn.dataset.result, durationMin, note);
    });
  });
}

function _submitFocusResult(result, durationMin, note = '') {
  const task = state.tasks.find(t => t.id === focus.taskId);
  focus.active = false;

  if (!task || !state.user) return;

  const todayStr = _eToday();
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
    ...(note ? { note } : {}),
  };

  _commitSession(session, task);
}

// ─── Shared session commit ────────────────────────────────────────────────────

function _commitSession(session, _task) {
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
    setTimeout(() => showLevelUp(newLevel, getDisplayTitle(newLevel, state.user)), 600);
  }
}

// ─── Daily morning report ────────────────────────────────────────────────────

function _getYesterdayStr() {
  const d = new Date();
  if (d.getHours() < (state.user?.newDayHour ?? 5)) d.setDate(d.getDate() - 1);
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return y.toLocaleDateString('sv');
}

function _reportSuggestions(stats, ySessions) {
  const tips = [];
  if (ySessions.length === 0) {
    tips.push({ icon: '🌟', text: '昨天是休息日，今天精力充沛，好好發揮！' });
    return tips;
  }
  if (!stats.hasASTask) tips.push({ icon: '🎯', text: '今天安排一個 A 或 S 級的重要任務' });
  if (stats.entertainmentMinutes > 120) {
    const hrs = (stats.entertainmentMinutes / 60).toFixed(1);
    tips.push({ icon: '⚖️', text: `昨天娛樂時間 ${hrs}hr，今天保持平衡` });
  }
  if (stats.productiveXP > 0 && stats.productiveXP < 50) {
    tips.push({ icon: '📈', text: `再 ${50 - stats.productiveXP} XP 就達有效日，今天衝一波！` });
  }
  if (stats.isEffectiveDay && (state.user.streakDays || 0) > 0) {
    tips.push({ icon: '🔥', text: `${state.user.streakDays} 天連勝中！繼續保持節奏` });
  }
  if (!stats.isEffectiveDay && (state.user.streakDays || 0) === 0) {
    tips.push({ icon: '💪', text: '今天重新出發，完成一個有效日！' });
  }
  if (!tips.length) tips.push({ icon: '🌱', text: '保持穩定節奏，每天進步一點點' });
  return tips.slice(0, 3);
}

function showDailyReport(onDone) {
  const yStr     = _getYesterdayStr();
  const ySess    = state.sessions.filter(s => s.date === yStr);
  const stats    = calcDailyStats(state.sessions, yStr);
  const totalXP  = ySess.reduce((sum, s) => sum + (s.finalXP || 0), 0);
  const valid    = ySess.filter(s => s.result !== 'invalid');

  // Value breakdown chips
  const vc = { S: 0, A: 0, B: 0, C: 0 };
  valid.forEach(s => { if (vc[s.value] !== undefined) vc[s.value]++; });
  const valueHtml = Object.entries(vc)
    .filter(([, n]) => n > 0)
    .map(([v, n]) => `<span class="rpt-chip rpt-chip-${v.toLowerCase()}">${v}×${n}</span>`)
    .join('');

  // Top 3 tasks by XP
  const taskMap = {};
  valid.forEach(s => {
    const k = s.taskId || s.taskName || '?';
    if (!taskMap[k]) taskMap[k] = { name: s.taskName || '未知任務', emoji: s.taskEmoji || '📌', xp: 0 };
    taskMap[k].xp += s.finalXP || 0;
  });
  const topTasks = Object.values(taskMap).sort((a, b) => b.xp - a.xp).slice(0, 3);
  const tasksHtml = topTasks.length
    ? topTasks.map(t => `
        <div class="rpt-task-row">
          <span>${t.emoji}</span>
          <span class="rpt-task-name">${t.name}</span>
          <span class="rpt-task-xp">+${t.xp} XP</span>
        </div>`).join('')
    : '<p class="rpt-empty">昨天沒有完成的任務</p>';

  const tips = _reportSuggestions(stats, ySess);
  const tipsHtml = tips.map(t =>
    `<div class="rpt-tip"><span>${t.icon}</span><span>${t.text}</span></div>`
  ).join('');

  const badge = stats.isEffectiveDay
    ? '<span class="rpt-badge rpt-badge-ok">✅ 有效日</span>'
    : ySess.length === 0
    ? '<span class="rpt-badge rpt-badge-rest">😴 休息日</span>'
    : '<span class="rpt-badge rpt-badge-partial">⬆️ 成長中</span>';

  const dateDisplay = new Date(yStr).toLocaleDateString('zh-TW',
    { month: 'long', day: 'numeric', weekday: 'short' });

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'daily-report-modal';
  modal.innerHTML = `
    <div class="modal-box modal-box-tall rpt-box">
      <div class="rpt-header">
        <div class="rpt-date">${dateDisplay}・昨日總結</div>
        ${badge}
      </div>

      <div class="rpt-stats-row">
        <div class="rpt-stat">
          <div class="rpt-stat-val">${totalXP}</div>
          <div class="rpt-stat-lbl">XP 獲得</div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-val">${valid.length}</div>
          <div class="rpt-stat-lbl">完成任務</div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-val">${state.user.streakDays || 0}🔥</div>
          <div class="rpt-stat-lbl">連勝天數</div>
        </div>
      </div>

      ${valueHtml ? `<div class="rpt-value-row">${valueHtml}</div>` : ''}

      <div class="rpt-section">
        <div class="rpt-section-title">📌 主要任務</div>
        ${tasksHtml}
      </div>

      <div class="rpt-section">
        <div class="rpt-section-title">💡 今日建議</div>
        ${tipsHtml}
      </div>

      <div class="rpt-section rpt-ai-section">
        <div class="rpt-section-title">🤖 AI 分析 <span class="rpt-ai-badge">即將推出</span></div>
        <p class="rpt-ai-text">AI 將根據你的習慣模式，提供個人化學習建議。</p>
      </div>

      <button class="btn-primary rpt-cta" id="rpt-next-btn">☀️ 開始新的一天</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('rpt-next-btn').addEventListener('click', () => {
    modal.remove();
    onDone();
  });
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

// ─── Sync banner ─────────────────────────────────────────────────────────────

let _syncHideTimer = null;

export function showSyncBanner(state) {
  const el = document.getElementById('sync-banner');
  if (!el) return;
  clearTimeout(_syncHideTimer);
  if (state === 'syncing') {
    el.className = 'syncing';
    el.textContent = '☁️ 同步中…';
  } else {
    el.className = 'synced';
    el.textContent = '✓ 已更新';
    _syncHideTimer = setTimeout(() => {
      el.className = 'hidden';
    }, 2000);
  }
}

// ─── Trial banner ────────────────────────────────────────────────────────────

function _showTrialBanner() {
  const banner = document.getElementById('trial-banner');
  if (!banner) return;
  if (!storage.isTrialUser()) { banner.classList.add('hidden'); return; }
  const daysLeft = storage.getTrialDaysRemaining();
  if (daysLeft > 5) { banner.classList.add('hidden'); return; }
  if (storage.getTrialBannerDismissDate() === today()) { banner.classList.add('hidden'); return; }

  banner.innerHTML =
    `<span class="trial-banner-text">✦ Pro 試用剩餘 <strong>${daysLeft}</strong> 天</span>` +
    `<button class="trial-banner-cta" onclick="window.navigate('settings')">升級 Pro</button>` +
    `<button class="trial-banner-close" onclick="window._dismissTrialBanner()">✕</button>`;
  banner.classList.remove('hidden');
}

window._dismissTrialBanner = function () {
  storage.saveTrialBannerDismissDate(today());
  document.getElementById('trial-banner')?.classList.add('hidden');
};

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
  try { await authSignOut(); } catch (e) { console.error('signOut error:', e); }
  handleSignOut();
};

window.deleteSession = function (sessionId) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  if (!confirm(`撤銷「${session.taskName}」這筆記錄？`)) return;

  // Reverse XP
  state.user.totalXP = Math.max(0, (state.user.totalXP || 0) - session.finalXP);

  // Reverse energy
  if (session.energyCost > 0) {
    state.energy.currentEnergy = Math.min(state.energy.maxEnergy,
      state.energy.currentEnergy + session.energyCost);
  }
  if (session.energyGain > 0) {
    state.energy.currentEnergy = Math.max(0,
      state.energy.currentEnergy - session.energyGain);
  }

  // Remove session
  state.sessions = state.sessions.filter(s => s.id !== sessionId);
  storage.saveSessions(state.sessions);
  storage.saveUser(state.user);
  storage.saveEnergy(state.energy);

  // Delete from Supabase
  db.deleteSession(sessionId).catch(console.error);

  updateHeader();
  renderPage(currentHash());
  showToast('已撤銷');
};

// ─── Weekly consistency bonus (called once/week) ──────────────────────────────

function checkWeeklyBonus() {
  if (!state.user) return;
  const todayStr = _eToday();
  const d = new Date(todayStr + 'T00:00:00');
  // Only check on Monday (day 1)
  if (d.getDay() !== 1) return;
  if (state.user.lastWeeklyBonusDate === todayStr) return;

  // Count effective days in the last 7 days
  let effectiveDays = 0;
  for (let i = 1; i <= 7; i++) {
    const dd = new Date(d); dd.setDate(dd.getDate() - i);
    const ds = dd.toLocaleDateString('sv');
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
      morningState: 'normal', newDayHour: 5, createdAt: today(),
    };
    storage.saveUser(state.user);

    if (state.tasks.length === 0) {
      state.tasks = createDefaultTasks();
      storage.saveTasks(state.tasks);
    }

    showMainApp();
    // Ask morning state on first day
    showMorningModal();
    // Show onboarding tour for new users (slight delay so page renders first)
    setTimeout(() => startTour(), 600);
  });
}

function showMainApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateHeader();
  renderPage(currentHash());
  _startDayWatcher();
  _showTrialBanner();
  if (sessionStorage.getItem('orbit_streak_unlock_new')) {
    sessionStorage.removeItem('orbit_streak_unlock_new');
    setTimeout(showStreakUnlockModal, 800);
  }
}

// ─── Cross-day watcher ────────────────────────────────────────────────────────

let _dayWatcherStarted = false;

function _startDayWatcher() {
  if (_dayWatcherStarted) return;
  _dayWatcherStarted = true;

  let _lastDate = _eToday();
  setInterval(() => {
    const current = _eToday();
    if (current !== _lastDate) {
      _lastDate = current;
      if (!state.user) return;
      // Reset daily plan for new day
      state.dailyPlan = [];
      storage.saveDailyPlan([]);
      // Apply random theme for new day (if feature enabled)
      applyRandomThemeForToday();
      // Show morning modal if energy not yet reset today
      if (state.energy.lastResetDate !== current) {
        showDailyReport(() => showMorningModal());
      }
    }
  }, 60_000); // check every minute
}

// ─── Theme & Background ───────────────────────────────────────────────────────

const _ALL_THEME_IDS = [
  'dark-purple', 'aurora-blue', 'emerald', 'flame', 'neon-pink', 'light',
  'wabi', 'material', 'cyberpunk', 'pixel', 'anime', 'gothic', 'github',
];

export function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  storage.saveTheme(themeId);
}

/** Pick and apply a random theme for today, but only once per calendar day. Pro only. */
export function applyRandomThemeForToday() {
  if (!storage.getRandomThemeEnabled()) return;
  if (!storage.isProUser() && !storage.isTrialUser()) return;
  const todayStr = today();
  if (storage.getRandomThemeDate() === todayStr) return; // already applied today
  const id = _ALL_THEME_IDS[Math.floor(Math.random() * _ALL_THEME_IDS.length)];
  applyTheme(id);
  storage.saveRandomThemeDate(todayStr);
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

// current tab: 'signin' | 'signup'
let _authTab = 'signin';

window.switchAuthTab = function (tab) {
  _authTab = tab;
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('auth-submit').textContent = tab === 'signin' ? '登入' : '註冊';
  document.getElementById('auth-password').autocomplete =
    tab === 'signin' ? 'current-password' : 'new-password';
  document.getElementById('auth-error').classList.add('hidden');
};

window.loginWithGoogle = async function () {
  const error = await signInWithGoogle();
  if (error) showToast('Google 登入失敗：' + (error.message || '請稍後再試'));
};

window.continueAsGuest = function () {
  _isGuest = true;
  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');
  state.user      = storage.getUser();
  state.tasks     = storage.getTasks();
  state.sessions  = storage.getSessions();
  state.energy    = storage.getEnergy();
  state.dailyPlan = storage.getDailyPlan();
  if (!state.tasks.length) {
    showSetup();
  } else {
    processYesterdayStreak();
    if (state.energy.lastResetDate !== _eToday()) {
      showMainApp(); showDailyReport(() => showMorningModal());
    } else {
      showMainApp();
    }
    checkWeeklyBonus();
  }
};

function _showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showLoginScreen() {
  hideLoading();
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');

  if (_loginListenerSet) return;
  _loginListenerSet = true;

  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn      = document.getElementById('auth-submit');
    btn.disabled   = true;
    document.getElementById('auth-error').classList.add('hidden');

    let error;
    if (_authTab === 'signin') {
      btn.textContent = '登入中…';
      ({ error } = await signIn(email, password));
      if (error) {
        btn.disabled    = false;
        btn.textContent = '登入';
        _showAuthError(
          error.message.includes('Invalid login') ? '帳號或密碼錯誤' : error.message
        );
      }
      // on success → onAuthStateChange fires → loadAndStart
    } else {
      btn.textContent = '註冊中…';
      ({ error } = await signUp(email, password));
      if (error) {
        btn.disabled    = false;
        btn.textContent = '註冊';
        _showAuthError(
          error.message.includes('already registered') ? '此 Email 已註冊，請直接登入' : error.message
        );
      } else {
        // Auto sign-in after sign-up (works when email confirmation is disabled)
        const { error: signInErr } = await signIn(email, password);
        if (signInErr) {
          btn.disabled    = false;
          btn.textContent = '註冊';
          _showAuthError('註冊成功！請用剛設定的密碼登入。');
          window.switchAuthTab('signin');
        }
        // on success → onAuthStateChange fires → loadAndStart
      }
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

  state.user      = storage.getUser();
  state.tasks     = storage.getTasks();
  state.sessions  = storage.getSessions();
  state.energy    = storage.getEnergy();
  state.dailyPlan = storage.getDailyPlan();

  // Start 15-day Pro trial for new authenticated users
  if (state.user && !state.user.trialStartedAt) {
    await db.startTrial(session.user.id);
    state.user = storage.getUser() ?? state.user;
  }

  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');

  if (!state.tasks.length) {
    // New user: no tasks yet — show setup to customise profile + seed defaults
    showSetup();
  } else {
    processYesterdayStreak();
    if (state.energy.lastResetDate !== _eToday()) {
      showMainApp();
      showDailyReport(() => showMorningModal());
    } else {
      showMainApp();
    }
    checkWeeklyBonus();
  }
}

function handleSignOut() {
  if (!_currentSession && !storage.getUser()) return; // already signed out
  _currentSession   = null;
  _isGuest          = false;
  _loginListenerSet = false;
  state.user     = null;
  state.tasks    = [];
  state.sessions = [];
  state.energy   = { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' };
  storage.clearAll();

  // Clear login form fields
  const emailEl = document.getElementById('auth-email');
  if (emailEl) emailEl.value = '';
  const pwEl = document.getElementById('auth-password');
  if (pwEl) pwEl.value = '';

  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('setup-screen').classList.add('hidden');
  showLoginScreen();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Fix Chrome viewport: window.innerHeight always equals the real visible height,
// unlike 100dvh which Chrome calculates including the collapsible address bar.
function _syncAppHeight() {
  document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
}
_syncAppHeight();
window.addEventListener('resize', _syncAppHeight);

async function init() {
  migrateV1toV2(today());
  migrateDefaultFlags();         // tag pre-existing default tasks with isDefault:true
  document.documentElement.setAttribute('data-theme', storage.getTheme());
  applyRandomThemeForToday(); // overrides saved theme if random-theme feature is on
  _renderBg(storage.getBgImage());

  // Listen for future auth changes (sign-ins, sign-outs)
  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !_currentSession) {
      await loadAndStart(session);
    } else if (event === 'SIGNED_OUT') {
      handleSignOut();
    }
  });

  // If we have cached user data, show app immediately — don't wait for Supabase
  const cachedUser = storage.getUser();
  if (cachedUser) {
    state.user      = cachedUser;
    state.tasks     = storage.getTasks();
    state.sessions  = storage.getSessions();
    state.energy    = storage.getEnergy();
    state.dailyPlan = storage.getDailyPlan();
    hideLoading();
    processYesterdayStreak();
    if (state.energy.lastResetDate !== _eToday()) {
      showMainApp(); showDailyReport(() => showMorningModal());
    } else {
      showMainApp();
    }
    checkWeeklyBonus();

    // Sync from Supabase in background (no spinner)
    getSession().then(session => {
      if (session) {
        _currentSession = session;
        showSyncBanner('syncing');
        db.loadFromRemote(session.user.id).then(() => {
          // Quietly refresh state from updated cache
          state.user     = storage.getUser()     || state.user;
          state.tasks    = storage.getTasks();
          state.sessions = storage.getSessions();
          state.energy   = storage.getEnergy();
          updateHeader();
          renderPage(currentHash());
          showSyncBanner('synced');
        }).catch(() => {
          showSyncBanner('synced'); // hide banner even on failure
        });
      }
    }).catch(() => {});
    return;
  }

  // No cache: wait for Supabase session (first launch or after sign-out)
  const session = await getSession();
  if (session) {
    await loadAndStart(session);
  } else {
    showLoginScreen();
  }
}

init();
