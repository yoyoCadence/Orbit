import { state } from '../state.js';
import { today, formatTime, formatDate } from '../utils.js';

export function renderGoals(container) {
  const allLogs = [...state.logs].reverse();

  if (allLogs.length === 0) {
    container.innerHTML = `
      <div class="section-title">📋 完成紀錄</div>
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>還沒有任何紀錄<br>去首頁打卡開始吧！</p>
      </div>
    `;
    return;
  }

  // Group by date
  const grouped = {};
  allLogs.forEach(l => {
    if (!grouped[l.date]) grouped[l.date] = [];
    grouped[l.date].push(l);
  });

  const groupsHtml = Object.entries(grouped).map(([date, logs]) => {
    const totalXP = logs.reduce((s, l) => s + l.xp, 0);
    const logsHtml = logs.map(l => `
      <div class="log-item">
        ${l.goalIconImg
          ? `<img src="${l.goalIconImg}" class="log-icon-img">`
          : `<span class="log-emoji">${l.goalEmoji || '🎯'}</span>`}
        <div class="log-info">
          <div class="log-name">${escHtml(l.goalName)}</div>
          <div class="log-time">${formatTime(l.completedAt)}</div>
        </div>
        <span class="log-xp">+${l.xp} XP</span>
      </div>
    `).join('');

    return `
      <div class="date-group">
        <div class="date-group-header">
          <span class="date-group-label">${formatDate(date)}</span>
          <span class="date-group-xp">+${totalXP} XP · ${logs.length} 次</span>
        </div>
        <div class="card" style="margin:0">${logsHtml}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="section-title">📋 完成紀錄</div>
    ${groupsHtml}
  `;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
