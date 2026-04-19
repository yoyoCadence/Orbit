import { state }                    from '../state.js';
import { storage }                   from '../storage.js';
import { formatTime, formatDate }    from '../utils.js';

const RESULT_ICON  = { complete: '✅', partial: '🔶', invalid: '❌', instant: '✓' };
const RESULT_LABEL = { complete: '完成', partial: '部分完成', invalid: '無效', instant: '完成' };

const FREE_DAYS = 30; // free tier history depth

export function renderGoals(container) {
  const isPro       = storage.isProUser();
  const allSessions = [...state.sessions].reverse();

  if (allSessions.length === 0) {
    container.innerHTML = `
      <div class="section-title">📋 完成紀錄</div>
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>還沒有任何紀錄<br>去首頁開始今日任務吧！</p>
      </div>
    `;
    return;
  }

  // Calculate free-tier cutoff (YYYY-MM-DD, local time)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - FREE_DAYS);
  const cutoff = cutoffDate.toLocaleDateString('sv');

  const visible = isPro ? allSessions : allSessions.filter(s => s.date >= cutoff);
  const hidden  = isPro ? [] : allSessions.filter(s => s.date < cutoff);

  // Group by date
  const grouped = {};
  visible.forEach(s => {
    if (!grouped[s.date]) grouped[s.date] = [];
    grouped[s.date].push(s);
  });

  const groupsHtml = Object.entries(grouped).map(([date, sessions]) => {
    const totalXP = sessions.reduce((sum, s) => sum + (s.finalXP || 0), 0);
    const rowsHtml = sessions.map(s => {
      const dur = s.durationMinutes > 0 ? ` · ${s.durationMinutes}m` : '';
      const xpStr = s.finalXP > 0
        ? `+${s.finalXP} XP`
        : s.energyGain > 0
          ? `+${s.energyGain} ⚡`
          : s.result === 'invalid' ? '0 XP' : '';
      return `
        <div class="log-item">
          <span class="log-result-icon">${RESULT_ICON[s.result] || '✓'}</span>
          <div class="log-info">
            <div class="log-name">${escHtml(s.taskName)}</div>
            <div class="log-time">${formatTime(s.completedAt)}${dur} · ${RESULT_LABEL[s.result] || ''}</div>
          </div>
          <span class="log-xp ${s.result === 'invalid' ? 'log-xp-invalid' : ''}">${xpStr}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="date-group">
        <div class="date-group-header">
          <span class="date-group-label">${formatDate(date)}</span>
          <span class="date-group-xp">+${totalXP} XP · ${sessions.length} 次</span>
        </div>
        <div class="card" style="margin:0">${rowsHtml}</div>
      </div>
    `;
  }).join('');

  const lockCardHtml = hidden.length > 0 ? `
    <div class="history-lock-card">
      <div class="history-lock-top">
        <span class="history-lock-icon">🔒</span>
        <div>
          <div class="history-lock-title">還有 ${hidden.length} 筆更早的紀錄</div>
          <div class="history-lock-desc">免費版顯示近 ${FREE_DAYS} 天 · 升級後立即完整呈現</div>
        </div>
      </div>
      <button class="history-lock-btn" onclick="window.navigate('settings')">查看 Pro 方案 →</button>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="section-title">📋 完成紀錄</div>
    ${groupsHtml}
    ${lockCardHtml}
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
