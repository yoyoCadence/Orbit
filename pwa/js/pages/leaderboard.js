import { state }    from '../state.js';
import { supabase } from '../supabase.js';
import { getLevelInfo } from '../leveling.js';

// ─── Growth rate calculation ──────────────────────────────────────────────────

/**
 * growthRate = weekXP / personalAvgWeekXP * 100
 * personalAvgWeekXP = totalXP / max(weeksActive, 1)
 */
function calcGrowthRate(totalXP, weekXP, createdAt) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksActive = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / msPerWeek);
  const avgWeekXP = totalXP / weeksActive;
  if (avgWeekXP < 1) return null; // not enough history
  return Math.round((weekXP / avgWeekXP) * 100);
}

function isNewUser(createdAt) {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return days < 14;
}

// ─── Render ───────────────────────────────────────────────────────────────────

let _tab = 'week'; // 'week' | 'growth'

export async function renderLeaderboard(container) {
  container.innerHTML = `
    <div class="section-title">🏆 排行榜</div>
    <div class="lb-loading">載入中…</div>
  `;

  let rows;
  try {
    const { data, error } = await supabase.from('leaderboard_view').select('*');
    if (error) throw error;
    rows = data;
  } catch {
    container.innerHTML = `
      <div class="section-title">🏆 排行榜</div>
      <div class="card"><div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">
        無法載入排行榜，請確認網路連線。
      </div></div>
    `;
    return;
  }

  if (!rows || rows.length === 0) {
    container.innerHTML = `
      <div class="section-title">🏆 排行榜</div>
      <div class="card">
        <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">
          目前還沒有公開用戶。<br>在設定頁開啟「顯示於排行榜」即可加入！
        </div>
      </div>
    `;
    return;
  }

  const myMode = state.user?.mode || 'normal';
  const filtered = rows.filter(r => r.mode === myMode);

  _renderContent(container, filtered);
}

function _renderContent(container, rows) {
  const myUserId = state.user?.id;

  // ── Week XP ranking ───────────────────────────────────────────────────────
  const weekRanked = [...rows]
    .sort((a, b) => b.week_xp - a.week_xp);

  // ── Growth rate ranking ───────────────────────────────────────────────────
  const growthRanked = [...rows]
    .map(r => ({
      ...r,
      growthRate: isNewUser(r.created_at) ? null : calcGrowthRate(r.total_xp, r.week_xp, r.created_at),
    }))
    .filter(r => r.growthRate !== null)
    .sort((a, b) => b.growthRate - a.growthRate);

  const activeRows  = _tab === 'week' ? weekRanked : growthRanked;
  const modeLabel = rows[0]?.mode === 'advanced' ? '進階模式' : '普通模式';

  const listHtml = activeRows.length
    ? activeRows.map((r, i) => {
        const isMe = r.user_id === myUserId;
        const lvl  = getLevelInfo(r.total_xp || 0).level;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const score = _tab === 'week'
          ? `${r.week_xp} XP`
          : `${r.growthRate}%`;
        const subLabel = _tab === 'week' ? '本週XP' : '成長率';
        const initial = (r.name || '?')[0].toUpperCase();

        return `
          <div class="lb-row ${isMe ? 'lb-row-me' : ''}">
            <span class="lb-rank">${medal}</span>
            <div class="lb-avatar">${initial}</div>
            <div class="lb-info">
              <div class="lb-name">${escHtml(r.name)}${isMe ? ' <span class="lb-you">你</span>' : ''}</div>
              <div class="lb-sub">Lv.${lvl} · 連勝 ${r.streak_days}天</div>
            </div>
            <div class="lb-score">
              <div class="lb-score-val">${score}</div>
              <div class="lb-score-lbl">${subLabel}</div>
            </div>
          </div>
        `;
      }).join('')
    : `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">
         尚無足夠資料（成長率需加入超過 2 週）
       </div>`;

  container.innerHTML = `
    <div class="section-title">🏆 排行榜</div>

    <div class="lb-tabs">
      <button class="lb-tab ${_tab === 'week' ? 'active' : ''}" data-tab="week">📅 本週XP</button>
      <button class="lb-tab ${_tab === 'growth' ? 'active' : ''}" data-tab="growth">📈 成長率</button>
    </div>

    <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-bottom:8px">
      ${modeLabel} · 僅顯示公開用戶
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      ${listHtml}
    </div>

    ${_tab === 'growth' ? `
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px;padding:0 4px">
        成長率 = 本週XP ÷ 個人週均XP × 100%。100% 為自身平均，越高代表本週越積極。
        加入未滿 2 週的用戶不參與成長率排名。
      </div>
    ` : ''}
  `;

  container.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      _renderContent(container, rows);
    });
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
