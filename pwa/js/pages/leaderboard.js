import { state }    from '../state.js';
import { storage }  from '../storage.js';
import { supabase } from '../supabase.js';
import { getLevelInfo } from '../leveling.js';
import { effectiveToday } from '../utils.js';

// ─── Growth rate calculation ──────────────────────────────────────────────────

/**
 * growthRate = weekXP / personalAvgWeekXP * 100
 * personalAvgWeekXP = totalXP / max(weeksActive, 1)
 */
export function calcGrowthRate(totalXP, weekXP, createdAt) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksActive = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / msPerWeek);
  const avgWeekXP = totalXP / weeksActive;
  if (avgWeekXP < 1) return null; // not enough history
  return Math.round((weekXP / avgWeekXP) * 100);
}

export function isNewUser(createdAt) {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return days < 14;
}

// ─── Render ───────────────────────────────────────────────────────────────────

let _tab = 'week'; // 'week' | 'growth' | 'total'

export async function renderLeaderboard(container) {
  const refreshHour = state.user?.newDayHour ?? 5;
  const refreshDate = effectiveToday(refreshHour);
  const cache = storage.getLeaderboardCache?.();
  const cachedRows = Array.isArray(cache?.rows) ? cache.rows : null;
  const isFresh = cachedRows && cache.refreshDate === refreshDate;

  if (isFresh) {
    _renderRows(container, cachedRows, cache.refreshedAt, false, refreshHour);
    return;
  }

  container.innerHTML = `
    <div class="section-title">🏆 排行榜</div>
    <div class="lb-loading">${cachedRows ? '更新排行榜中…' : '載入排行榜中…'}</div>
  `;

  let rows;
  try {
    const { data, error } = await supabase.from('leaderboard_view').select('*');
    if (error) throw error;
    rows = data || [];
    storage.saveLeaderboardCache?.(rows, new Date().toISOString(), refreshDate);
  } catch {
    if (cachedRows) {
      _renderRows(container, cachedRows, cache.refreshedAt, true, refreshHour);
      return;
    }
    container.innerHTML = `
      <div class="section-title">🏆 排行榜</div>
      <div class="card"><div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">
        無法載入排行榜，請確認網路連線。
      </div></div>
    `;
    return;
  }

  _renderRows(container, rows, new Date().toISOString(), false, refreshHour);
}

function _renderRows(container, rows, refreshedAt, isStale, refreshHour) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `
      <div class="section-title">🏆 排行榜</div>
      <div class="card">
        <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">
          目前還沒有公開用戶。<br>在設定頁開啟「顯示於排行榜」即可加入！
        </div>
      </div>
      ${_refreshNoteHtml(refreshedAt, isStale, refreshHour)}
    `;
    return;
  }

  const myMode = state.user?.mode || 'normal';
  const filtered = rows.filter(r => r.mode === myMode);

  _renderContent(container, filtered, refreshedAt, isStale, refreshHour);
}

function _renderContent(container, rows, refreshedAt, isStale, refreshHour) {
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

  // ── Total XP ranking ─────────────────────────────────────────────────────
  const totalRanked = [...rows]
    .sort((a, b) => b.total_xp - a.total_xp);

  const activeRows = _tab === 'week' ? weekRanked
    : _tab === 'growth'              ? growthRanked
    :                                  totalRanked;
  const modeLabel = rows[0]?.mode === 'advanced' ? '進階模式' : '普通模式';

  const listHtml = activeRows.length
    ? activeRows.map((r, i) => {
        const isMe = r.user_id === myUserId;
        const lvl  = getLevelInfo(r.total_xp || 0).level;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const score = _tab === 'week'   ? `${r.week_xp} XP`
          : _tab === 'growth'           ? `${r.growthRate}%`
          :                               `${r.total_xp} XP`;
        const subLabel = _tab === 'week' ? '本週XP'
          : _tab === 'growth'            ? '成長率'
          :                                '累積XP';
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
      <button class="lb-tab ${_tab === 'week'   ? 'active' : ''}" data-tab="week">📅 本週XP</button>
      <button class="lb-tab ${_tab === 'growth' ? 'active' : ''}" data-tab="growth">📈 成長率</button>
      <button class="lb-tab ${_tab === 'total'  ? 'active' : ''}" data-tab="total">🏅 累積XP</button>
    </div>

    <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-bottom:8px">
      ${modeLabel} · 僅顯示公開用戶
    </div>
    ${_refreshNoteHtml(refreshedAt, isStale, refreshHour)}

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
      _renderContent(container, rows, refreshedAt, isStale, refreshHour);
    });
  });
}

function _refreshNoteHtml(refreshedAt, isStale, refreshHour) {
  const hourText = `${String(refreshHour).padStart(2, '0')}:00`;
  const timeText = refreshedAt
    ? new Date(refreshedAt).toLocaleString('zh-TW', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '尚未更新';
  return `
    <div class="lb-refresh-note ${isStale ? 'is-stale' : ''}">
      每日 ${hourText} 後首次開啟時更新；上次更新 ${timeText}${isStale ? '，目前顯示快取資料' : ''}
    </div>
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
