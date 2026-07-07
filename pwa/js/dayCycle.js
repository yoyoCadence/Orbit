// Day-cycle logic: effective-date helper, energy reset, yesterday streak
// processing, streak shield UI, weekly consistency bonus, daily report +
// morning modal, and the cross-day watcher. Moved verbatim from app.js.

import { state }   from './state.js';
import { storage, db } from './storage.js';
import { calcDailyStats, processStreakForDate } from './engine.js';
import { effectiveToday } from './utils.js';
import { renderPage, currentHash } from './router.js';
import { showToast, showXPFloat } from './ui/feedback.js';
import { updateHeader } from './ui/header.js';
import { applyRandomThemeForToday } from './theme.js';
import {
  FLAG_SHIELD_PENDING, FLAG_SHIELD_DISMISSED, FLAG_SHIELD_SCROLL_TOP,
  FLAG_STREAK_UNLOCK_NEW,
} from './flags.js';

/** Effective date for session recording — respects user's newDayHour threshold. */
export function eToday() { return effectiveToday(state.user?.newDayHour ?? 5); }

// ─── Energy reset ────────────────────────────────────────────────────────────

/** Reset energy if we're on a new day. If morningState provided, set energy accordingly. */
export function resetEnergyIfNewDay(morningState) {
  const todayStr = eToday();
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
export function processYesterdayStreak() {
  if (!state.user) return;
  const todayStr = eToday();
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
      localStorage.setItem(FLAG_SHIELD_PENDING, JSON.stringify({ prevStreak }));
    }
  }

  // SUB-16: 45-day streak → 30-day free Pro (granted once per account)
  if (
    state.user.streakDays >= 45 &&
    !storage.isProUser() &&
    !state.user.streakUnlockUsed
  ) {
    state.user.isPro           = true;
    state.user.proExpiresAt    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    state.user.streakUnlockUsed = true;
    sessionStorage.setItem(FLAG_STREAK_UNLOCK_NEW, '1');
  }

  state.user.lastStreakDate = todayStr;
  storage.saveUser(state.user);
}

// ─── Streak Shield ────────────────────────────────────────────────────────────

window.useStreakShield = function () {
  const raw = localStorage.getItem(FLAG_SHIELD_PENDING);
  if (!raw || !state.user) return;
  if (!storage.isProUser()) return;
  const { prevStreak } = JSON.parse(raw);
  state.user.streakDays = prevStreak;
  state.user.streakShieldCount = Math.max(0, (state.user.streakShieldCount || 0) - 1);
  localStorage.removeItem(FLAG_SHIELD_PENDING);
  sessionStorage.removeItem(FLAG_SHIELD_DISMISSED);
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
    sessionStorage.setItem(FLAG_SHIELD_DISMISSED, '1');
    renderPage(currentHash());
  };
};

window.reshowShieldBanner = function () {
  sessionStorage.removeItem(FLAG_SHIELD_DISMISSED);
  sessionStorage.setItem(FLAG_SHIELD_SCROLL_TOP, '1');
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

export function showStreakUnlockModal() {
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

export function showDailyReport(onDone) {
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

export function showMorningModal() {
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

// ─── Weekly consistency bonus (called once/week) ──────────────────────────────

export function checkWeeklyBonus() {
  if (!state.user) return;
  const todayStr = eToday();
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

// ─── Cross-day watcher ────────────────────────────────────────────────────────

let _dayWatcherStarted = false;

export function startDayWatcher() {
  if (_dayWatcherStarted) return;
  _dayWatcherStarted = true;

  let _lastDate = eToday();
  setInterval(() => {
    const current = eToday();
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
