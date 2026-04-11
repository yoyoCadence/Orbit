import { state }               from '../state.js';
import { calcDailyStats, calcValueConfidence } from '../engine.js';

export function renderReview(container) {
  // ── Build last-7-days date list ───────────────────────────────────────────
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const weekSessions = state.sessions.filter(s => dates.includes(s.date));

  // ── Weekly XP ─────────────────────────────────────────────────────────────
  const weekProductiveXP = weekSessions
    .filter(s => s.isProductiveXP)
    .reduce((sum, s) => sum + s.finalXP, 0);

  // ── Effective days ────────────────────────────────────────────────────────
  const dailyStats = dates.map(d => calcDailyStats(state.sessions, d));
  const effectiveDays = dailyStats.filter(d => d.isEffectiveDay).length;

  // ── Daily bar data ────────────────────────────────────────────────────────
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

  // ── Task value distribution ───────────────────────────────────────────────
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

  // ── Recovery vs entertainment ─────────────────────────────────────────────
  const recMin = weekSessions
    .filter(s => s.impactType === 'recovery')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const entMin = weekSessions
    .filter(s => s.impactType === 'entertainment')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  // ── Most completed tasks ──────────────────────────────────────────────────
  const taskCount = {};
  weekSessions.forEach(s => {
    if (s.result !== 'invalid') {
      taskCount[s.taskName] = (taskCount[s.taskName] || 0) + 1;
    }
  });
  const topTasks = Object.entries(taskCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topTasksHtml = topTasks.length
    ? topTasks.map(([name, cnt]) =>
        `<div class="top-task-row">
           <span class="top-task-name">${escHtml(name)}</span>
           <span class="top-task-count">${cnt} 次</span>
         </div>`
      ).join('')
    : '<div style="color:var(--text-muted);font-size:13px">本週尚無完成任務</div>';

  // ── Invalid sessions ──────────────────────────────────────────────────────
  const invalidCount = weekSessions.filter(s => s.result === 'invalid').length;

  // ── Tasks needing calibration ─────────────────────────────────────────────
  const calibrateTasks = state.tasks
    .filter(t => (t.value === 'A' || t.value === 'S'))
    .map(t => ({ task: t, confidence: calcValueConfidence(t, state.sessions) }))
    .filter(({ confidence }) => confidence < 80)
    .sort((a, b) => a.confidence - b.confidence);

  const calibrateHtml = calibrateTasks.length
    ? calibrateTasks.map(({ task, confidence }) => {
        const cls = confidence >= 60 ? 'conf-warn' : 'conf-low';
        const label = confidence >= 60 ? '需留意' : '建議校準';
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

  container.innerHTML = `
    <div class="section-title">📊 週回顧</div>

    <!-- Summary row -->
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

    <!-- Daily XP bars -->
    <div class="card">
      <div class="card-title">📈 每日成長XP</div>
      <div class="bar-chart">${dayBars}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
        實心點 = 有效日（XP≥50 + A/S任務 + 娛樂≤120m）
      </div>
    </div>

    <!-- Value distribution -->
    <div class="card">
      <div class="card-title">🎯 任務價值分佈</div>
      ${distHtml || '<div style="color:var(--text-muted);font-size:13px">本週尚無資料</div>'}
    </div>

    <!-- Time distribution -->
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

    <!-- Top tasks -->
    <div class="card">
      <div class="card-title">🏆 最常完成任務</div>
      ${topTasksHtml}
    </div>

    <!-- Value calibration -->
    <div class="card">
      <div class="card-title">🔍 待校準任務</div>
      ${calibrateHtml}
    </div>
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
