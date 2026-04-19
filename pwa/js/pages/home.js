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
      if (e.target.closest('.plan-drag-handle')) return;
      if (_planDrag.wasDragging) { _planDrag.wasDragging = false; return; }
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

  // ── Bind: task icon → show detail modal ─────────────────────────────────────
  container.querySelectorAll('.task-icon-wrap').forEach(wrap => {
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      const taskId = wrap.closest('.task-card').dataset.taskId;
      const task   = state.tasks.find(t => t.id === taskId);
      if (task) showTaskDetail(task);
    });
  });

  // ── Bind: swipe "詳細" buttons → show detail modal ───────────────────────────
  container.querySelectorAll('.swipe-detail-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      // Close the swipe state before opening modal so closing modal leaves card clean
      btn.closest('.task-card')?.classList.remove('swipe-open');
      const task = state.tasks.find(t => t.id === btn.dataset.taskId);
      if (task) showTaskDetail(task);
    });
  });

  // ── Bind: regular task cards → add to plan ───────────────────────────────────
  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      if (_drag.wasDragging) { _drag.wasDragging = false; return; }
      // If this card has a swipe open, close it instead of adding to plan
      if (card.classList.contains('swipe-open')) {
        card.classList.remove('swipe-open');
        return;
      }
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
  _setupPlanDragAndDrop(container);
  _setupCardSwipe(container);
}

// ─── Plan card HTML ───────────────────────────────────────────────────────────

function planCardHtml(task, countToday) {
  const isFocus   = task.category === 'focus';
  const xpLabel   = task.value !== 'D' ? `+${xpPreview(task)}${isFocus ? '+' : ''} XP` : '';
  const doneClass = countToday > 0 ? 'plan-card-done' : '';
  return `
    <div class="plan-card ${doneClass}" data-task-id="${task.id}" data-category="${task.category}">
      <div class="plan-drag-handle" title="拖曳排序">⠿</div>
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
      <div class="task-card-body">
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
      <div class="swipe-detail-action">
        <button class="swipe-detail-btn" data-task-id="${task.id}">詳細</button>
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

// ─── Task detail modal ───────────────────────────────────────────────────────

const DIFFICULTY_LABEL  = { '0.4': '低', '0.7': '中', '1': '高', '1.0': '高' };
const RESISTANCE_LABEL  = { '1': '低', '1.0': '低', '1.2': '中', '1.4': '高' };

function showTaskDetail(task) {
  // Stats from sessions
  const taskSess = state.sessions.filter(s => s.taskId === task.id && s.result !== 'invalid');
  const totalDone = taskSess.length;
  const avgDur = totalDone
    ? Math.round(taskSess.reduce((s, x) => s + (x.durationMinutes || 0), 0) / totalDone)
    : 0;
  const lastSess = taskSess.length
    ? taskSess.reduce((a, b) => (a.completedAt > b.completedAt ? a : b))
    : null;
  const lastDate = lastSess
    ? new Date(lastSess.completedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
    : '—';

  const confidence = task.valueConfidence ?? 100;
  const confColor  = confidence >= 80 ? '#10b981' : confidence >= 60 ? '#f59e0b' : '#ef4444';
  const iconHtml   = task.iconImg
    ? `<img src="${task.iconImg}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`
    : `<span style="font-size:40px;line-height:1">${task.emoji || '🎯'}</span>`;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box task-detail-box">
      <div class="modal-header">
        <span class="modal-title">任務細節</span>
        <button class="modal-close-btn" aria-label="關閉">✕</button>
      </div>

      <div class="task-detail-hero">
        ${iconHtml}
        <div>
          <div class="task-detail-name">${escHtml(task.name)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
            ${task.value !== 'D' ? `<span class="badge ${VALUE_CLASS[task.value]}">${VALUE_LABEL[task.value]}</span>` : ''}
            <span class="badge badge-nature">${NATURE_LABEL[task.taskNature] || task.taskNature}</span>
            ${task.category === 'focus' ? '<span class="badge" style="background:rgba(124,58,237,.15);color:var(--primary-lt)">專注</span>' : ''}
          </div>
        </div>
      </div>

      <div class="task-detail-grid">
        <div class="task-detail-cell">
          <div class="task-detail-lbl">難度</div>
          <div class="task-detail-val">${DIFFICULTY_LABEL[String(task.difficulty)] || '—'}</div>
        </div>
        <div class="task-detail-cell">
          <div class="task-detail-lbl">阻力</div>
          <div class="task-detail-val">${RESISTANCE_LABEL[String(task.resistance)] || '—'}</div>
        </div>
        <div class="task-detail-cell">
          <div class="task-detail-lbl">完成次數</div>
          <div class="task-detail-val">${totalDone}</div>
        </div>
        <div class="task-detail-cell">
          <div class="task-detail-lbl">平均時長</div>
          <div class="task-detail-val">${totalDone ? avgDur + ' 分' : '—'}</div>
        </div>
        <div class="task-detail-cell">
          <div class="task-detail-lbl">上次完成</div>
          <div class="task-detail-val">${lastDate}</div>
        </div>
        <div class="task-detail-cell">
          <div class="task-detail-lbl">標籤信心</div>
          <div class="task-detail-val" style="color:${confColor}">${confidence}%</div>
        </div>
      </div>

      ${task.successCriteria ? `
        <div class="task-detail-section">
          <div class="task-detail-lbl">成功標準</div>
          <div class="task-detail-text">${escHtml(task.successCriteria)}</div>
        </div>` : ''}

      ${task.reason ? `
        <div class="task-detail-section">
          <div class="task-detail-lbl">任務原因</div>
          <div class="task-detail-text">${escHtml(task.reason)}</div>
        </div>` : ''}
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.modal-close-btn').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// ─── Task card left-swipe to reveal "詳細" button ────────────────────────────
//
// Touch-only: trackstart records startX/Y; touchmove checks if horizontal swipe
// (|dx| > |dy| × 1.5 and |dx| > 12 px threshold) and adds swipe-open class.
// Tap anywhere outside the detail button closes open cards.

function _setupCardSwipe(container) {
  let _swipeOpen    = null;  // currently open card
  let _horizSwiped  = false; // block page-switch touchend on document

  const _closeSwipe = () => {
    if (_swipeOpen) { _swipeOpen.classList.remove('swipe-open'); _swipeOpen = null; }
  };

  container.querySelectorAll('.task-card').forEach(card => {
    let sx = 0, sy = 0, tracking = false;

    card.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
      _horizSwiped = false;
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (Math.abs(dx) < 12) return;
      tracking = false; // one decision per gesture
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        _horizSwiped = true;  // flag: suppress page-switch on touchend
        if (dx < 0) {
          // Left swipe → open this card, close previous
          if (_swipeOpen && _swipeOpen !== card) _closeSwipe();
          card.classList.add('swipe-open');
          _swipeOpen = card;
        } else {
          // Right swipe → close
          if (card === _swipeOpen) _closeSwipe();
        }
      }
    }, { passive: true });

    // stopPropagation prevents the document-level page-switch touchend handler
    // from seeing this event when we already handled it as a card swipe.
    card.addEventListener('touchend', e => {
      tracking = false;
      if (_horizSwiped) {
        e.stopPropagation();
        _horizSwiped = false;
      }
    }, { passive: true });
  });

  // Close swipe on tap outside any task card
  container.addEventListener('click', e => {
    if (_swipeOpen && !e.target.closest('.task-card')) _closeSwipe();
  });
}

// ─── Drag & Drop (reorder tasks within sections) ──────────────────────────────
//
// ─── Plan list drag-and-drop (drag handle → immediate drag, no long-press) ────
//
// The ⠿ handle has touch-action:none so vertical pointer events go to JS, not
// the browser scroll handler. Dropping reorders state.dailyPlan and persists.

const _planDrag = {
  active:      false,
  wasDragging: false,
  taskId:      null,
  card:        null,
  clone:       null,
  offY:        0,
  lastY:       0,
};

function _setupPlanDragAndDrop(container) {
  const planList = container.querySelector('#plan-list');
  if (!planList) return;

  planList.querySelectorAll('.plan-drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();                          // prevent text selection & click
      const card = handle.closest('.plan-card');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      _planDrag.active = true;
      _planDrag.taskId = card.dataset.taskId;
      _planDrag.card   = card;
      _planDrag.offY   = e.clientY - rect.top;
      _planDrag.lastY  = e.clientY;

      const clone = card.cloneNode(true);
      clone.style.cssText = [
        'position:fixed',
        `width:${rect.width}px`, `height:${rect.height}px`,
        `left:${rect.left}px`,   `top:${rect.top}px`,
        'opacity:.85', 'pointer-events:none', 'z-index:500',
        'transform:scale(1.02)',
        'box-shadow:0 8px 24px rgba(0,0,0,.35)',
      ].join(';');
      document.body.appendChild(clone);
      _planDrag.clone = clone;
      card.classList.add('plan-drag-placeholder');
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', e => {
      if (!_planDrag.active) return;
      _planDrag.lastY = e.clientY;
      _planDrag.clone.style.top = (e.clientY - _planDrag.offY) + 'px';
      _clearPlanDragOver(planList);
      const target = _planCardUnderY(planList, e.clientY);
      if (target && target !== _planDrag.card) {
        const mid = target.getBoundingClientRect();
        target.classList.add(
          e.clientY < mid.top + mid.height / 2
            ? 'plan-drag-over-top'
            : 'plan-drag-over-bottom'
        );
      }
    }, { passive: false });

    handle.addEventListener('pointerup',     () => { if (_planDrag.active) _endPlanDrag(planList); });
    // pointercancel never fires a subsequent click, so clear the flag immediately
    handle.addEventListener('pointercancel', () => { if (_planDrag.active) { _endPlanDrag(planList); _planDrag.wasDragging = false; } });
  });
}

function _endPlanDrag(planList) {
  _planDrag.wasDragging = true;
  _planDrag.clone.remove();
  _planDrag.card.classList.remove('plan-drag-placeholder');
  _clearPlanDragOver(planList);

  const target = _planCardUnderY(planList, _planDrag.lastY);
  if (target && target !== _planDrag.card) {
    const mid        = target.getBoundingClientRect();
    const before     = _planDrag.lastY < mid.top + mid.height / 2;
    const dragId     = _planDrag.taskId;
    const targetId   = target.dataset.taskId;
    const plan       = state.dailyPlan.filter(id => id !== dragId);
    const idx        = plan.indexOf(targetId);
    if (idx !== -1) plan.splice(before ? idx : idx + 1, 0, dragId);
    state.dailyPlan  = plan;
    import('../storage.js').then(({ storage: s }) => s.saveDailyPlan(plan));
    if (_container) renderHome(_container);
  }

  _planDrag.active = false;
  _planDrag.taskId = null;
  _planDrag.card   = null;
  _planDrag.clone  = null;
  setTimeout(() => { _planDrag.wasDragging = false; }, 50);
}

function _planCardUnderY(planList, y) {
  for (const card of planList.querySelectorAll('.plan-card')) {
    const r = card.getBoundingClientRect();
    if (y >= r.top && y <= r.bottom) return card;
  }
  return null;
}

function _clearPlanDragOver(planList) {
  planList.querySelectorAll('.plan-drag-over-top, .plan-drag-over-bottom')
    .forEach(el => el.classList.remove('plan-drag-over-top', 'plan-drag-over-bottom'));
}

// Long-press (500 ms) on any task card activates drag.
// Moving >8 px before the timer fires cancels (treat as scroll).
// Uses Pointer Events + bounding-rect hit testing (reliable on mobile).

const _drag = {
  active:      false,
  wasDragging: false,  // suppresses the click that follows pointerup
  taskId:      null,
  card:        null,
  clone:       null,
  offX:        0,
  offY:        0,
  lastX:       0,
  lastY:       0,
};

function _setupDragAndDrop(container) {
  let _pressTimer = null;
  let _pressData  = null; // { card, pointerId, clientX, clientY, offX, offY }

  function _cancelPress() {
    clearTimeout(_pressTimer);
    _pressTimer = null;
    _pressData  = null;
  }

  container.querySelectorAll('.task-card').forEach(card => {

    // Prevent long-press context menu (Android "Copy/Paste", iOS callout)
    // so the 500 ms drag timer fires cleanly without system UI interference.
    card.addEventListener('contextmenu', e => e.preventDefault());

    card.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      _cancelPress();

      const rect = card.getBoundingClientRect();
      _pressData = {
        card,
        pointerId: e.pointerId,
        clientX:   e.clientX,
        clientY:   e.clientY,
        offX:      e.clientX - rect.left,
        offY:      e.clientY - rect.top,
      };

      _pressTimer = setTimeout(() => {
        _pressTimer = null;
        _activateDrag(_pressData);
        _pressData = null;
      }, 500);
    });

    card.addEventListener('pointermove', e => {
      if (_drag.active) {
        _drag.lastX = e.clientX;
        _drag.lastY = e.clientY;
        _drag.clone.style.left = (e.clientX - _drag.offX) + 'px';
        _drag.clone.style.top  = (e.clientY - _drag.offY) + 'px';
        _clearDragOver(container);
        const under = _cardUnderPoint(container, e.clientX, e.clientY);
        if (under && under !== _drag.card) under.classList.add('drag-over');
      } else if (_pressData) {
        const dx = Math.abs(e.clientX - _pressData.clientX);
        const dy = Math.abs(e.clientY - _pressData.clientY);
        if (dx > 8 || dy > 8) _cancelPress(); // restores touch-action → scroll resumes
      }
    });

    card.addEventListener('pointerup', () => {
      _cancelPress();
      if (_drag.active) _endDrag(container);
    });

    card.addEventListener('pointercancel', () => {
      _cancelPress();
      if (_drag.active) _endDrag(container);
    });
  });
}

function _activateDrag(pressData) {
  const { card, pointerId, offX, offY, clientX, clientY } = pressData;
  if (navigator.vibrate) navigator.vibrate(50);

  const rect = card.getBoundingClientRect();
  _drag.active = true;
  _drag.taskId = card.dataset.taskId;
  _drag.card   = card;
  _drag.offX   = offX;
  _drag.offY   = offY;
  _drag.lastX  = clientX;
  _drag.lastY  = clientY;

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
  card.setPointerCapture(pointerId);
}

function _endDrag(container) {
  if (!_drag.active) return;
  _drag.wasDragging = true; // suppress the click event that follows pointerup

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
