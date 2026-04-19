import { state }               from '../state.js';
import { storage }             from '../storage.js';
import { today }               from '../utils.js';
import { calcDailyStats, calcValueConfidence } from '../engine.js';

const FREE_MONTHS = 3; // free tier month-view depth

// ─── Module-level view state ──────────────────────────────────────────────────
let _viewMode  = 'week';
let _viewYear  = new Date().getFullYear();
let _viewMonth = new Date().getMonth(); // 0-indexed

// Expose navigation handlers on window so inline HTML onclick can reach them
window._reviewSetMode = (mode) => { _viewMode = mode; _rerender(); };
window._reviewPrevMonth = () => {
  let m = _viewMonth - 1, y = _viewYear;
  if (m < 0) { m = 11; y--; }
  const now = new Date();
  const monthsAgo = (now.getFullYear() - y) * 12 + (now.getMonth() - m);
  if (!storage.isProUser() && monthsAgo > FREE_MONTHS) return;
  _viewMonth = m; _viewYear = y;
  _rerender();
};
window._reviewNextMonth = () => {
  _viewMonth++;
  if (_viewMonth > 11) { _viewMonth = 0; _viewYear++; }
  _rerender();
};

let _container = null;
function _rerender() {
  if (_container) renderReview(_container);
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export function renderReview(container) {
  _container = container;

  const toggleHtml = `
    <div class="review-toggle">
      <button class="review-toggle-btn ${_viewMode === 'week'  ? 'active' : ''}"
              onclick="window._reviewSetMode('week')">週視圖</button>
      <button class="review-toggle-btn ${_viewMode === 'month' ? 'active' : ''}"
              onclick="window._reviewSetMode('month')">月視圖</button>
    </div>
  `;

  if (_viewMode === 'month') {
    container.innerHTML = toggleHtml + buildMonthView();
  } else {
    container.innerHTML = toggleHtml + buildWeekView();
  }
}

// ─── Week view ────────────────────────────────────────────────────────────────
function buildWeekView() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const weekSessions = state.sessions.filter(s => dates.includes(s.date));

  const weekProductiveXP = weekSessions
    .filter(s => s.isProductiveXP)
    .reduce((sum, s) => sum + s.finalXP, 0);

  const dailyStats = dates.map(d => calcDailyStats(state.sessions, d));
  const effectiveDays = dailyStats.filter(d => d.isEffectiveDay).length;

  const maxXP = Math.max(...dailyStats.map(d => d.productiveXP), 1);

  const dayBars = dailyStats.map(ds => {
    const d = new Date(ds.date + 'T00:00:00');
    const label = d.toLocaleDateString('zh-TW', { weekday: 'short' });
    const pct   = Math.round((ds.productiveXP / maxXP) * 100);
    const cls   = ds.isEffectiveDay ? 'bar-effective' : ds.productiveXP > 0 ? 'bar-partial' : 'bar-empty';
    return `
      <div class="bar-col">
        <div class="bar-track">
          <div class="bar-fill ${cls}" style="height:${pct}%"></div>
        </div>
        <div class="bar-val">${ds.productiveXP > 0 ? ds.productiveXP : ''}</div>
        <div class="bar-label">${label}</div>
        <div class="bar-dot ${ds.isEffectiveDay ? 'dot-on' : 'dot-off'}"></div>
      </div>
    `;
  }).join('');

  const taskXP = {};
  weekSessions.filter(s => s.isProductiveXP).forEach(s => {
    const v = s.value || 'B';
    taskXP[v] = (taskXP[v] || 0) + s.finalXP;
  });
  const totalDistXP = Object.values(taskXP).reduce((a, b) => a + b, 0) || 1;
  const distHtml = ['S','A','B'].map(v => {
    const xp  = taskXP[v] || 0;
    const pct = Math.round((xp / totalDistXP) * 100);
    return `
      <div class="dist-row">
        <span class="dist-label badge badge-${v.toLowerCase()}">${v}級</span>
        <div class="dist-bar-track">
          <div class="dist-bar-fill badge-${v.toLowerCase()}-bg" style="width:${pct}%"></div>
        </div>
        <span class="dist-pct">${pct}%</span>
      </div>
    `;
  }).join('');

  const recMin = weekSessions
    .filter(s => s.impactType === 'recovery')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const entMin = weekSessions
    .filter(s => s.impactType === 'entertainment')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  const taskCount = {};
  weekSessions.forEach(s => {
    if (s.result !== 'invalid') {
      taskCount[s.taskName] = (taskCount[s.taskName] || 0) + 1;
    }
  });
  const topTasks = Object.entries(taskCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTasksHtml = topTasks.length
    ? topTasks.map(([name, cnt]) =>
        `<div class="top-task-row">
           <span class="top-task-name">${escHtml(name)}</span>
           <span class="top-task-count">${cnt} 次</span>
         </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:13px">本週尚無完成任務</div>';

  const invalidCount = weekSessions.filter(s => s.result === 'invalid').length;

  const calibrateTasks = state.tasks
    .filter(t => t.value === 'A' || t.value === 'S')
    .map(t => ({ task: t, confidence: calcValueConfidence(t, state.sessions) }))
    .filter(({ confidence }) => confidence < 80)
    .sort((a, b) => a.confidence - b.confidence);

  const calibrateHtml = calibrateTasks.length
    ? calibrateTasks.map(({ task, confidence }) => {
        const cls   = confidence >= 60 ? 'conf-warn' : 'conf-low';
        const label = confidence >= 60 ? '需留意'    : '建議校準';
        return `
          <div class="calibrate-row">
            <span class="calibrate-emoji">${task.emoji || '🎯'}</span>
            <div class="calibrate-info">
              <div class="calibrate-name">${escHtml(task.name)}</div>
              <div class="calibrate-sub">可信度 ${confidence}</div>
            </div>
            <span class="calibrate-badge ${cls}">${label}</span>
          </div>
        `;
      }).join('')
    : '<div style="color:var(--text-muted);font-size:13px">所有任務標籤可信 ✓</div>';

  return `
    <div class="section-title">📊 週回顧</div>

    <div class="review-summary">
      <div class="review-stat">
        <div class="review-stat-val">${weekProductiveXP}</div>
        <div class="review-stat-lbl">本週成長XP</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val">${effectiveDays} / 7</div>
        <div class="review-stat-lbl">有效天數</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val">${state.user?.streakDays || 0}</div>
        <div class="review-stat-lbl">當前連勝</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📈 每日成長XP</div>
      <div class="bar-chart">${dayBars}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
        實心點 = 有效日（XP≥50 + A/S任務 + 娛樂≤120m）
      </div>
    </div>

    <div class="card">
      <div class="card-title">🎯 任務價值分佈</div>
      ${distHtml || '<div style="color:var(--text-muted);font-size:13px">本週尚無資料</div>'}
    </div>

    <div class="card">
      <div class="card-title">⏱ 時間分佈（本週）</div>
      <div class="time-dist-row">
        <div class="time-dist-item">
          <span class="time-dist-icon">🌿</span>
          <span class="time-dist-val">${recMin}m</span>
          <span class="time-dist-lbl">恢復</span>
        </div>
        <div class="time-dist-item">
          <span class="time-dist-icon">🎭</span>
          <span class="time-dist-val">${entMin}m</span>
          <span class="time-dist-lbl">娛樂</span>
        </div>
        <div class="time-dist-item">
          <span class="time-dist-icon">❌</span>
          <span class="time-dist-val">${invalidCount}</span>
          <span class="time-dist-lbl">無效次數</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🏆 最常完成任務</div>
      ${topTasksHtml}
    </div>

    <div class="card">
      <div class="card-title">🔍 待校準任務</div>
      ${calibrateHtml}
    </div>
  `;
}

// ─── Month view ───────────────────────────────────────────────────────────────
function buildMonthView() {
  const year  = _viewYear;
  const month = _viewMonth; // 0-indexed

  // Lock check for free users
  const now = new Date();
  const monthsAgo = (now.getFullYear() - year) * 12 + (now.getMonth() - month);
  const isPro = storage.isProUser();
  const isLocked = !isPro && monthsAgo >= FREE_MONTHS;

  const monthLabel = new Date(year, month, 1).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long',
  });
  const isCurrentOrFuture = (year > now.getFullYear()) ||
    (year === now.getFullYear() && month >= now.getMonth());
  const navHtml = `
    <div class="month-nav">
      <button class="month-nav-btn" onclick="window._reviewPrevMonth()">‹</button>
      <span class="month-nav-label">${monthLabel}</span>
      <button class="month-nav-btn" onclick="window._reviewNextMonth()"
              ${isCurrentOrFuture ? 'disabled' : ''}>›</button>
    </div>
  `;

  if (isLocked) {
    return `
      <div class="section-title">📅 月視圖</div>
      ${navHtml}
      <div class="history-lock-card">
        <div class="history-lock-top">
          <span class="history-lock-icon">🔒</span>
          <div>
            <div class="history-lock-title">${FREE_MONTHS} 個月前的月份已鎖定</div>
            <div class="history-lock-desc">免費版可查看近 ${FREE_MONTHS} 個月 · Pro 無限歷史</div>
          </div>
        </div>
        <button class="history-lock-btn" onclick="window.navigate('settings')">查看 Pro 方案 →</button>
      </div>
    `;
  }

  // All days in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const allDates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    allDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  // Sessions for this month
  const monthSessions = state.sessions.filter(s => s.date && s.date.startsWith(
    `${year}-${String(month + 1).padStart(2, '0')}`
  ));

  // Stats per day
  const statsMap = {};
  allDates.forEach(d => { statsMap[d] = calcDailyStats(state.sessions, d); });

  // Monthly summary
  const monthXP = monthSessions
    .filter(s => s.isProductiveXP)
    .reduce((sum, s) => sum + s.finalXP, 0);

  const effectiveDays = allDates.filter(d => statsMap[d].isEffectiveDay).length;

  // Best streak within this month
  let bestStreak = 0, curStreak = 0;
  allDates.forEach(d => {
    if (statsMap[d].isEffectiveDay) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
    else { curStreak = 0; }
  });

  // Calendar grid: leading empty cells so the 1st lands on right weekday
  const firstDOW = new Date(year, month, 1).getDay(); // 0=Sun
  // We use Mon-first display: convert Sun→6, Mon→0, …
  const leadingEmpties = (firstDOW + 6) % 7;

  const DAY_HEADERS = ['一','二','三','四','五','六','日'];
  const dayHeadersHtml = DAY_HEADERS.map(h =>
    `<div class="cal-header-cell">${h}</div>`
  ).join('');

  const emptyCells = Array(leadingEmpties).fill('<div class="cal-cell cal-cell-empty"></div>').join('');

  const todayStr = today();

  const dayCells = allDates.map(dateStr => {
    const ds  = statsMap[dateStr];
    const day = parseInt(dateStr.slice(8), 10);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const dotCls = isFuture ? 'cal-dot-future'
      : ds.isEffectiveDay     ? 'cal-dot-effective'
      : ds.productiveXP > 0  ? 'cal-dot-partial'
      : 'cal-dot-empty';
    const xpStr = (!isFuture && ds.productiveXP > 0) ? ds.productiveXP : '';

    return `
      <div class="cal-cell ${isToday ? 'cal-cell-today' : ''}">
        <div class="cal-day-num ${isToday ? 'cal-today-num' : ''}">${day}</div>
        <div class="cal-dot ${dotCls}"></div>
        <div class="cal-xp">${xpStr}</div>
      </div>
    `;
  }).join('');

  // Top tasks this month
  const taskCount = {};
  monthSessions.forEach(s => {
    if (s.result !== 'invalid') {
      taskCount[s.taskName] = (taskCount[s.taskName] || 0) + 1;
    }
  });
  const topTasks = Object.entries(taskCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTasksHtml = topTasks.length
    ? topTasks.map(([name, cnt]) =>
        `<div class="top-task-row">
           <span class="top-task-name">${escHtml(name)}</span>
           <span class="top-task-count">${cnt} 次</span>
         </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:13px">本月尚無完成任務</div>';

  return `
    <div class="section-title">📅 月視圖</div>
    ${navHtml}

    <!-- Monthly summary -->
    <div class="review-summary">
      <div class="review-stat">
        <div class="review-stat-val">${monthXP}</div>
        <div class="review-stat-lbl">本月成長XP</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val">${effectiveDays}</div>
        <div class="review-stat-lbl">有效天數</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val">${bestStreak}</div>
        <div class="review-stat-lbl">最長連勝</div>
      </div>
    </div>

    <!-- Calendar -->
    <div class="card">
      <div class="cal-legend">
        <span class="cal-dot cal-dot-effective"></span><span>有效日</span>
        <span class="cal-dot cal-dot-partial"></span><span>部分</span>
        <span class="cal-dot cal-dot-empty"></span><span>無記錄</span>
      </div>
      <div class="cal-grid">
        ${dayHeadersHtml}
        ${emptyCells}
        ${dayCells}
      </div>
    </div>

    <!-- Top tasks this month -->
    <div class="card">
      <div class="card-title">🏆 本月最常完成</div>
      ${topTasksHtml}
    </div>
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
