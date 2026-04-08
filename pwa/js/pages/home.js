import { state } from '../state.js';
import { today, formatTime } from '../utils.js';

export function renderHome(container) {
  const todayStr = today();
  const todayLogs = state.logs.filter(l => l.date === todayStr);

  // Count completions per goal today
  const counts = {};
  todayLogs.forEach(l => { counts[l.goalId] = (counts[l.goalId] || 0) + 1; });

  const totalTodayXP = todayLogs.reduce((s, l) => s + l.xp, 0);

  const dateLabel = new Date().toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  });

  // Goal grid
  const goalsHtml = state.goals.length
    ? state.goals.map(g => `
        <button class="goal-btn" onclick="window.logGoal('${g.id}')">
          ${counts[g.id] ? `<span class="count-badge">${counts[g.id]}</span>` : ''}
          ${goalIconHtml(g, true)}
          <span class="goal-name">${escHtml(g.name)}</span>
          <span class="goal-xp">+${g.xp} XP</span>
        </button>
      `).join('')
    : `<div class="empty-state" style="grid-column:1/-1">
         <div class="empty-icon">🎯</div>
         <p>前往設定新增你的第一個目標！</p>
       </div>`;

  // Today's log list
  const logsHtml = todayLogs.length
    ? [...todayLogs].reverse().map(l => `
        <div class="log-item">
          ${logIconHtml(l)}
          <div class="log-info">
            <div class="log-name">${escHtml(l.goalName)}</div>
            <div class="log-time">${formatTime(l.completedAt)}</div>
          </div>
          <span class="log-xp">+${l.xp} XP</span>
        </div>
      `).join('')
    : `<div class="empty-state">
         <div class="empty-icon">⚡</div>
         <p>點擊上方目標開始今日記錄！</p>
       </div>`;

  container.innerHTML = `
    <div class="date-badge">📅 ${dateLabel}</div>

    ${totalTodayXP > 0 ? `
      <div class="card today-xp-card">
        <div class="today-xp-label">今日獲得</div>
        <div class="today-xp-value">+${totalTodayXP} XP</div>
        <div class="today-xp-sub">${todayLogs.length} 次打卡</div>
      </div>
    ` : ''}

    <div class="section-title">⚡ 快速打卡</div>
    <div class="goal-grid">${goalsHtml}</div>

    <div class="section-title" style="margin-top:20px">📝 今日紀錄</div>
    <div class="card">${logsHtml}</div>
  `;
}

function goalIconHtml(goal, large = false) {
  if (goal.iconImg)
    return `<img src="${goal.iconImg}" class="${large ? 'goal-icon-img-lg' : 'goal-icon-img'}">`;
  return `<span class="${large ? 'goal-emoji' : 'log-emoji'}">${goal.emoji || '🎯'}</span>`;
}

function logIconHtml(log) {
  if (log.goalIconImg)
    return `<img src="${log.goalIconImg}" class="log-icon-img">`;
  return `<span class="log-emoji">${log.goalEmoji || '🎯'}</span>`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
