import { state }              from '../state.js';
import { effectiveToday, formatTime } from '../utils.js';
import { calcDailyStats, reorderTasks } from '../engine.js';

// ─── Value / impactType labels ────────────────────────────────────────────────

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

// ─── Module-level container ref (for drag re-render) ─────────────────────────

let _container = null;

// ─── Main render ──────────────────────────────────────────────────────────────

export function renderHome(container) {
  _container = container;

  const todayStr  = effectiveToday(state.user?.newDayHour ?? 5);
  const todaySess = state.sessions.filter(s => s.date === todayStr);
  const stats     = calcDailyStats(state.sessions, todayStr);
  const energy    = state.energy;

  // Completion count per task today
  const counts = {};
  todaySess.forEach(s => { counts[s.taskId] = (counts[s.taskId] || 0) + 1; });

  const dateLabel = new Date().toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  });

  // Effective day indicator
  const effectiveParts = [];
  if (stats.productiveXP >= 50)          effectiveParts.push('+成長XP');
  if (stats.hasASTask)                   effectiveParts.push('+A/S任務');
  if (stats.entertainmentMinutes <= 120) effectiveParts.push('+娛樂合理');
  const effectiveAll = effectiveParts.length === 3;

  const streakIndicator = effectiveAll
    ? `<span class="streak-ok">今日有效 🔥</span>`
    : `<span class="streak-warn">未達有效日 (${effectiveParts.join(' ')})</span>`;

  // Stats bar
  const energyPct   = Math.round((energy.currentEnergy / energy.maxEnergy) * 100);
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

  // Daily plan
  const planIds   = state.dailyPlan || [];
  const planTasks = planIds.map(id => state.tasks.find(t => t.id === id)).filter(Boolean);
  const planHtml  = planTasks.length
    ? planTasks.map(t => planCardHtml(t, counts[t.id] || 0)).join('')
    : `<div class="plan-empty">點擊下方任務小卡加入計劃 👇</div>`;

  // Group tasks by section
  const growthTasks = state.tasks.filter(t => t.taskNature === 'growth');
  const maintTasks  = state.tasks.filter(t =>
    t.taskNature === 'maintenance' || t.taskNature === 'obligation');
  const recEntTasks = state.tasks.filter(t =>
    t.taskNature === 'recovery' || t.taskNature === 'entertainment');

  // Recent sessions (today, reversed)
  const recentSess = [...todaySess].reverse();

  container.innerHTML = `
    <div class="date-badge">📅 ${dateLabel}</div>

    ${statsBar}

    <div class="effective-row">${streakIndicator}</div>

    <!-- 本日計劃 -->
    <div class="section-title">📋 本日計劃</div>
    <div class="plan-list" id="plan-list">${planHtml}</div>

    ${growthTasks.length ? `
      <div class="section-title">🚀 成長任務</div>
      <div class="task-grid" data-section="growth">
        ${growthTasks.map(t => taskCardHtml(t, counts[t.id] || 0, planIds.includes(t.id))).join('')}
      </div>
    ` : ''}

    ${maintTasks.length ? `
      <div class="section-title">⚙️ 維持 / 必要</div>
      <div class="task-grid" data-section="maint">
        ${maintTasks.map(t => taskCardHtml(t, counts[t.id] || 0, planIds.includes(t.id))).join('')}
      </div>
    ` : ''}

    ${recEntTasks.length ? `
      <div class="section-title">🌿 恢復 / 娛樂</div>
      <div class="task-grid" data-section="rec">
        ${recEntTasks.map(t => taskCardHtml(t, counts[t.id] || 0, planIds.includes(t.id))).join('')}
      </div>
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

  // ── Bind: plan cards → complete task ─────────────────────────────────────────
  container.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.plan-remove-btn')) return;
      const id  = card.dataset.taskId;
      const cat = card.dataset.category;
      if (cat === 'focus') window.startFocus(id);
      else window.completeInstant(id);
    });
  });

  container.querySelectorAll('.plan-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.removeFromDailyPlan(btn.dataset.removeId);
    });
  });

  // ── Bind: regular task cards → add to plan ───────────────────────────────────
  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.drag-handle')) return;
      window.addToDailyPlan(card.dataset.taskId);
    });
  });

  // ── Bind: session delete buttons ─────────────────────────────────────────────
  container.querySelectorAll('.session-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.deleteSession(btn.dataset.sessionId);
    });
  });

  // ── Setup drag-and-drop ───────────────────────────────────────────────────────
  _setupDragAndDrop(container);
}

// ─── Plan card HTML ───────────────────────────────────────────────────────────

function planCardHtml(task, countToday) {
  const isFocus   = task.category === 'focus';
  const xpLabel   = task.value !== 'D' ? `+${xpPreview(task)}${isFocus ? '+' : ''} XP` : '';
  const doneClass = countToday > 0 ? 'plan-card-done' : '';
  return `
    <div class="plan-card ${doneClass}" data-task-id="${task.id}" data-category="${task.category}">
      <span class="plan-task-emoji">
        ${task.iconImg
          ? `<img src="${task.iconImg}" class="plan-icon-img">`
          : (task.emoji || '🎯')}
      </span>
      <div class="plan-task-info">
        <div class="plan-task-name">${escHtml(task.name)}</div>
        ${xpLabel ? `<div class="plan-task-xp">${xpLabel}${isFocus ? ' · 專注' : ''}</div>` : ''}
      </div>
      ${countToday > 0 ? `<span class="plan-count-badge">${countToday}</span>` : ''}
      <button class="plan-remove-btn" data-remove-id="${task.id}" title="移除">✕</button>
    </div>
  `;
}

// ─── Task card HTML ──────────────────────────────────────────────────────────

function taskCardHtml(task, countToday, inPlan) {
  const isFocus    = task.category === 'focus';
  const xpLabel    = task.value !== 'D'
    ? `+${xpPreview(task)}${isFocus ? '+' : ''} XP`
    : task.impactType === 'recovery' ? '回能' : '娛樂';
  const valueLabel = VALUE_LABEL[task.value] || '';
  const valueCls   = VALUE_CLASS[task.value]  || '';
  const natureLbl  = NATURE_LABEL[task.taskNature] || task.taskNature;

  return `
    <div class="task-card ${isFocus ? 'task-card-focus' : 'task-card-instant'} ${inPlan ? 'task-card-in-plan' : ''}"
         data-task-id="${task.id}" data-category="${task.category}"
         style="--task-accent:${IMPACT_COLOR[task.impactType] || 'var(--primary)'}">
      <div class="drag-handle" title="拖曳排序">⋮⋮</div>
      ${countToday > 0 ? `<span class="count-badge">${countToday}</span>` : ''}
      <div class="task-card-top">
        <div class="task-icon-wrap${task.isDefault === false ? ' task-icon-custom' : ''}">
          ${task.iconImg
            ? `<img src="${task.iconImg}" class="task-icon-img">`
            : `<span class="task-emoji">${task.emoji || '🎯'}</span>`}
        </div>
        <div class="task-badges">
          ${valueLabel ? `<span class="badge ${valueCls}">${valueLabel}</span>` : ''}
          <span class="badge badge-nature">${natureLbl}</span>
        </div>
      </div>
      <div class="task-name">${escHtml(task.name)}</div>
      <div class="task-footer">
        <span class="task-xp-label">${xpLabel}</span>
        ${inPlan ? `<span class="plan-indicator">📋</span>` : (isFocus ? `<span class="focus-btn-label">▶ 專注</span>` : '')}
      </div>
    </div>
  `;
}

// ─── Session row HTML ────────────────────────────────────────────────────────

const RESULT_ICON = { complete: '✅', partial: '🔶', invalid: '❌', instant: '✓' };

function sessionRowHtml(s) {
  const icon  = RESULT_ICON[s.result] || '✓';
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
      <button class="session-del-btn" data-session-id="${s.id}" title="撤銷">✕</button>
    </div>
  `;
}

// ─── XP preview (base, no streak) ────────────────────────────────────────────
// Weight maps mirror engine.js exactly (include '1' key for number-stored values)

function xpPreview(task) {
  if (task.value === 'D') return 0;
  const vw = { S: 3.2, A: 2.2, B: 1.2, D: 0 }[task.value] ?? 0;
  const dw = { '0.4': 0.4, '0.7': 0.7, '1': 1.0, '1.0': 1.0 }[String(task.difficulty)] ?? 0;
  const rw = { '1': 1.0, '1.0': 1.0, '1.2': 1.2, '1.4': 1.4 }[String(task.resistance)] ?? 0;
  return Math.round(20 * vw * dw * rw);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Drag & Drop (reorder tasks within sections) ──────────────────────────────
//
// Uses Pointer Events + bounding-rect hit testing (reliable on mobile).
// All mutable state is kept in the `_drag` object so there are no
// scattered module-level variables.

const _drag = {
  active:  false,
  taskId:  null,
  card:    null,
  clone:   null,
  offX:    0,
  offY:    0,
  lastX:   0,   // updated every pointermove; used in pointerup/cancel
  lastY:   0,
};

function _setupDragAndDrop(container) {
  container.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const card = handle.closest('.task-card');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      _drag.active = true;
      _drag.taskId = card.dataset.taskId;
      _drag.card   = card;
      _drag.offX   = e.clientX - rect.left;
      _drag.offY   = e.clientY - rect.top;
      _drag.lastX  = e.clientX;
      _drag.lastY  = e.clientY;

      // Clone for visual drag feedback
      const clone = card.cloneNode(true);
      clone.style.cssText = `
        position:fixed;
        width:${rect.width}px;height:${rect.height}px;
        top:${rect.top}px;left:${rect.left}px;
        opacity:.88;pointer-events:none;z-index:500;
        transform:scale(1.04) rotate(1deg);
        box-shadow:0 10px 36px rgba(0,0,0,.45);
        transition:transform .1s;
      `;
      document.body.appendChild(clone);
      _drag.clone = clone;
      card.classList.add('drag-placeholder');

      window._isDragging = true;
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', e => {
      if (!_drag.active) return;
      _drag.lastX = e.clientX;
      _drag.lastY = e.clientY;

      _drag.clone.style.left = (e.clientX - _drag.offX) + 'px';
      _drag.clone.style.top  = (e.clientY - _drag.offY) + 'px';

      _clearDragOver(container);
      const under = _cardUnderPoint(container, e.clientX, e.clientY);
      if (under && under !== _drag.card) under.classList.add('drag-over');
    });

    handle.addEventListener('pointerup',    () => _endDrag(container));
    handle.addEventListener('pointercancel', () => _endDrag(container));
  });
}

function _endDrag(container) {
  if (!_drag.active) return;

  _drag.clone.remove();
  _drag.card.classList.remove('drag-placeholder');
  _clearDragOver(container);

  // Use last known pointer position for hit testing (reliable vs. pointerup coords)
  const target = _cardUnderPoint(container, _drag.lastX, _drag.lastY);
  if (target && target !== _drag.card && _drag.taskId) {
    const newTasks = reorderTasks(state.tasks, _drag.taskId, target.dataset.taskId);
    state.tasks.splice(0, state.tasks.length, ...newTasks);
    import('../storage.js').then(({ storage: s }) => s.saveTasks(state.tasks));
    if (_container) renderHome(_container);
  }

  _drag.active = false;
  _drag.taskId = null;
  _drag.card   = null;
  _drag.clone  = null;
  setTimeout(() => { window._isDragging = false; }, 50);
}

/**
 * Find the task card whose bounding rect contains (x, y), ignoring the
 * drag clone (which has pointer-events:none but its rect still exists).
 * Bounding-rect iteration is reliable on mobile where elementsFromPoint
 * can miss elements behind fixed-position overlays.
 */
function _cardUnderPoint(container, x, y) {
  const cards = container.querySelectorAll('.task-card');
  for (const card of cards) {
    if (card === _drag.card) continue;
    const r = card.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return card;
  }
  return null;
}

function _clearDragOver(container) {
  container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}
