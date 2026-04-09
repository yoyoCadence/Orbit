import { state }              from '../state.js';
import { today, formatTime } from '../utils.js';
import { calcDailyStats }    from '../engine.js';

// ─── Value / impactType labels ───────────────────────────────────────────────

const VALUE_LABEL = { S: 'S級', A: 'A級', B: 'B級', D: '' };
const VALUE_CLASS = { S: 'badge-s', A: 'badge-a', B: 'badge-b', D: 'badge-d' };
const NATURE_LABEL = {
  growth:        '成長',
  maintenance:   '維持',
  obligation:    '必要',
  recovery:      '恢復',
  entertainment: '娛樂',
};
const IMPACT_COLOR = {
  task:          'var(--primary)',
  recovery:      '#10b981',
  entertainment: '#8b5cf6',
};

// ─── Main render ─────────────────────────────────────────────────────────────

export function renderHome(container) {
  const todayStr   = today();
  const todaySess  = state.sessions.filter(s => s.date === todayStr);
  const stats      = calcDailyStats(state.sessions, todayStr);
  const energy     = state.energy;

  // Completion count per task today
  const counts = {};
  todaySess.forEach(s => { counts[s.taskId] = (counts[s.taskId] || 0) + 1; });

  const dateLabel = new Date().toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  });

  // Effective day indicator
  const effectiveParts = [];
  if (stats.productiveXP >= 50)  effectiveParts.push(`+成長XP`);
  if (stats.hasASTask)            effectiveParts.push(`+A/S任務`);
  if (stats.entertainmentMinutes <= 120) effectiveParts.push(`+娛樂合理`);
  const effectiveAll = effectiveParts.length === 3;

  const streakIndicator = effectiveAll
    ? `<span class="streak-ok">今日有效 🔥</span>`
    : `<span class="streak-warn">未達有效日 (${effectiveParts.join(' ')})</span>`;

  // Stats bar
  const energyPct = Math.round((energy.currentEnergy / energy.maxEnergy) * 100);
  const energyClass = energyPct >= 60 ? 'energy-high' : energyPct >= 30 ? 'energy-mid' : 'energy-low';

  const statsBar = `
    <div class="stats-bar">
      <div class="stat-pill">
        <span class="stat-pill-icon">⭐</span>
        <span class="stat-pill-val">${stats.productiveXP}</span>
        <span class="stat-pill-lbl">成長XP</span>
      </div>
      <div class="stat-pill">
        <span class="stat-pill-icon">🔥</span>
        <span class="stat-pill-val">${state.user?.streakDays || 0}</span>
        <span class="stat-pill-lbl">連勝</span>
      </div>
      <div class="stat-pill ${energyClass}">
        <span class="stat-pill-icon">⚡</span>
        <span class="stat-pill-val">${energy.currentEnergy}</span>
        <span class="stat-pill-lbl">精力</span>
      </div>
      <div class="stat-pill">
        <span class="stat-pill-icon">🎭</span>
        <span class="stat-pill-val">${stats.entertainmentMinutes}m</span>
        <span class="stat-pill-lbl">娛樂</span>
      </div>
    </div>
  `;

  // Group tasks by section
  const growthTasks  = state.tasks.filter(t => t.taskNature === 'growth');
  const maintTasks   = state.tasks.filter(t =>
    t.taskNature === 'maintenance' || t.taskNature === 'obligation');
  const recEntTasks  = state.tasks.filter(t =>
    t.taskNature === 'recovery' || t.taskNature === 'entertainment');

  // Recent sessions (today, reversed)
  const recentSess = [...todaySess].reverse();

  container.innerHTML = `
    <div class="date-badge">📅 ${dateLabel}</div>

    ${statsBar}

    <div class="effective-row">${streakIndicator}</div>

    ${growthTasks.length ? `
      <div class="section-title">🚀 成長任務</div>
      <div class="task-grid">${growthTasks.map(t => taskCardHtml(t, counts[t.id] || 0)).join('')}</div>
    ` : ''}

    ${maintTasks.length ? `
      <div class="section-title">⚙️ 維持 / 必要</div>
      <div class="task-grid">${maintTasks.map(t => taskCardHtml(t, counts[t.id] || 0)).join('')}</div>
    ` : ''}

    ${recEntTasks.length ? `
      <div class="section-title">🌿 恢復 / 娛樂</div>
      <div class="task-grid">${recEntTasks.map(t => taskCardHtml(t, counts[t.id] || 0)).join('')}</div>
    ` : ''}

    ${state.tasks.length === 0 ? `
      <div class="empty-state" style="margin-top:40px">
        <div class="empty-icon">🎯</div>
        <p>前往設定新增你的第一個任務！</p>
      </div>
    ` : ''}

    <div class="section-title" style="margin-top:20px">📝 今日紀錄</div>
    <div class="card">
      ${recentSess.length
        ? recentSess.map(s => sessionRowHtml(s)).join('')
        : `<div class="empty-state"><div class="empty-icon">⚡</div><p>點擊任務開始今日記錄！</p></div>`
      }
    </div>
  `;

  // Bind task card clicks
  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      const id  = card.dataset.taskId;
      const cat = card.dataset.category;
      if (cat === 'focus') {
        window.startFocus(id);
      } else {
        window.completeInstant(id);
      }
    });
  });
}

// ─── Task card HTML ──────────────────────────────────────────────────────────

function taskCardHtml(task, countToday) {
  const isRecEnt   = task.impactType === 'recovery' || task.impactType === 'entertainment';
  const xpLabel    = task.value !== 'D'
    ? `+${xpPreview(task)} XP`
    : task.impactType === 'recovery' ? '回能' : '娛樂';
  const valueLabel = VALUE_LABEL[task.value] || '';
  const valueCls   = VALUE_CLASS[task.value]  || '';
  const natureLbl  = NATURE_LABEL[task.taskNature] || task.taskNature;
  const isFocus    = task.category === 'focus';

  return `
    <div class="task-card ${isFocus ? 'task-card-focus' : 'task-card-instant'}"
         data-task-id="${task.id}" data-category="${task.category}"
         style="--task-accent:${IMPACT_COLOR[task.impactType] || 'var(--primary)'}">
      ${countToday > 0 ? `<span class="count-badge">${countToday}</span>` : ''}
      <div class="task-card-top">
        ${task.iconImg
          ? `<img src="${task.iconImg}" class="task-icon-img">`
          : `<span class="task-emoji">${task.emoji || '🎯'}</span>`}
        <div class="task-badges">
          ${valueLabel ? `<span class="badge ${valueCls}">${valueLabel}</span>` : ''}
          <span class="badge badge-nature">${natureLbl}</span>
        </div>
      </div>
      <div class="task-name">${escHtml(task.name)}</div>
      <div class="task-footer">
        <span class="task-xp-label">${xpLabel}</span>
        ${isFocus ? `<span class="focus-btn-label">▶ 專注</span>` : ''}
      </div>
    </div>
  `;
}

// ─── Session row HTML ────────────────────────────────────────────────────────

const RESULT_ICON = { complete: '✅', partial: '🔶', invalid: '❌', instant: '✓' };

function sessionRowHtml(s) {
  const icon = RESULT_ICON[s.result] || '✓';
  const xpStr = s.finalXP > 0
    ? `+${s.finalXP} XP`
    : s.energyGain > 0
      ? `+${s.energyGain} ⚡`
      : s.result === 'invalid' ? '0 XP' : '完成';
  const dur = s.durationMinutes > 0 ? ` · ${s.durationMinutes}m` : '';

  return `
    <div class="log-item">
      <span class="log-result-icon">${icon}</span>
      <div class="log-info">
        <div class="log-name">${escHtml(s.taskName)}</div>
        <div class="log-time">${formatTime(s.completedAt)}${dur}</div>
      </div>
      <span class="log-xp ${s.result === 'invalid' ? 'log-xp-invalid' : ''}">${xpStr}</span>
    </div>
  `;
}

// ─── XP preview (base, no streak) ────────────────────────────────────────────

function xpPreview(task) {
  if (task.value === 'D') return 0;
  const vw = { S: 3.2, A: 2.2, B: 1.2, D: 0 }[task.value] ?? 0;
  const dw = { '0.4': 0.4, '0.7': 0.7, '1.0': 1.0 }[String(task.difficulty)] ?? 0;
  const rw = { '1.0': 1.0, '1.2': 1.2, '1.4': 1.4 }[String(task.resistance)] ?? 0;
  return Math.round(20 * vw * dw * rw);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
