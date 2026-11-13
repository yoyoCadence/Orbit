import { state }    from '../state.js';
import { supabase } from '../supabase.js';
import { SUPABASE_URL } from '../config.js';
import { getLevelInfo } from '../leveling.js';
import { effectiveToday, escHtml } from '../utils.js';
import {
  fetchLeaderboardRows,
  leaderboardCacheGeneration,
  readLeaderboardCacheV2,
  writeLeaderboardCacheV2,
} from '../leaderboardPublic.js';

// ─── Growth rate calculation ──────────────────────────────────────────────────

/**
 * growthRate = weekXP / personalAvgWeekXP * 100
 * personalAvgWeekXP = totalXP / max(weeksActive, 1)
 * `createdAt` is any date string Date can parse; get_leaderboard() gives the
 * UTC join date (`joined_on`, e.g. '2026-11-01').
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

function isCurrentLeaderboardRender(container) {
  return !container.dataset?.route || container.dataset.route === 'leaderboard';
}

// INFRA-110: only signed-in users may read the leaderboard (migration 015; since
// PRO-014E2 through get_leaderboard(), 018); a guest's data stays on this device. A guest has no session stored by the
// Supabase client (its default key). Read the key, not getSession(): that first
// tries to refresh an expired token, which offline takes ~25 s and then reports
// no session although the account is still signed in.
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
function isGuest() {
  try {
    return !localStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}

export async function renderLeaderboard(container) {
  const refreshHour = state.user?.newDayHour ?? 5;
  const refreshDate = effectiveToday(refreshHour);
  // PRO-014E2: its own cache key. Rows of leaderboard_view (user_id, name,
  // created_at) are never mixed with get_leaderboard() rows, and the rows of
  // one account (is_me) are never shown to another.
  const ownerId = state.user?.id ?? null;
  const generation = leaderboardCacheGeneration();
  const cache = readLeaderboardCacheV2(ownerId);
  const cachedRows = Array.isArray(cache?.rows) ? cache.rows : null;
  const isFresh = cachedRows && cache.refreshDate === refreshDate;

  if (isGuest()) {
    container.innerHTML = `
      <div class="section-title">🏆 排行榜</div>
      <div class="card"><div class="lb-guest" style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">
        登入帳號後才能看排行榜。遊客的資料只存在這台裝置，不會出現在排行榜上。
      </div></div>
    `;
    return;
  }

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
    rows = await _withAvatarUrls(await fetchLeaderboardRows());
  } catch {
    if (!isCurrentLeaderboardRender(container) || state.user?.id !== ownerId) return;
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

  // Signed out or switched accounts while the request was out: these rows
  // (is_me) answer the previous account. Neither cache nor show them.
  if (state.user?.id !== ownerId) return;
  // A name or opt-in saved while the request was out cleared the cache; these
  // rows predate it, so show them but leave the next visit to ask again.
  if (generation === leaderboardCacheGeneration()) {
    writeLeaderboardCacheV2(ownerId, rows, new Date().toISOString(), refreshDate);
  }
  if (!isCurrentLeaderboardRender(container)) return;
  _renderRows(container, rows, new Date().toISOString(), false, refreshHour);
}

function _renderRows(container, rows, refreshedAt, isStale, refreshHour) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `
      <div class="section-title">🏆 排行榜</div>
      <div class="card">
        <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">
          目前還沒有公開用戶。<br>在設定頁開啟「顯示於排行榜」並設定公開名稱即可加入！
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
  // ── Week XP ranking ───────────────────────────────────────────────────────
  const weekRanked = [...rows]
    .sort((a, b) => Number(b.week_xp) - Number(a.week_xp));

  // ── Growth rate ranking ───────────────────────────────────────────────────
  const growthRanked = [...rows]
    .map(r => ({
      ...r,
      growthRate: isNewUser(r.joined_on) ? null : calcGrowthRate(r.total_xp, r.week_xp, r.joined_on),
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
        // get_leaderboard() never returns user_id; the server marks the caller.
        const isMe = r.is_me === true;
        const lvl  = getLevelInfo(r.total_xp || 0).level;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const score = _tab === 'week'   ? `${r.week_xp} XP`
          : _tab === 'growth'           ? `${r.growthRate}%`
          :                               `${r.total_xp} XP`;
        const subLabel = _tab === 'week' ? '本週XP'
          : _tab === 'growth'            ? '成長率'
          :                                '累積XP';
        // First code point, so an emoji or a CJK Extension B character stays whole.
        const initial = (Array.from(r.display_name || '?')[0] || '?').toUpperCase();
        const avatarHtml = r.avatar_display_url
          ? `<img src="${escAttr(r.avatar_display_url)}" alt="">`
          : escHtml(initial);

        return `
          <div class="lb-row ${isMe ? 'lb-row-me' : ''}">
            <span class="lb-rank">${medal}</span>
            <div class="lb-avatar">${avatarHtml}</div>
            <div class="lb-info">
              <div class="lb-name"><span class="lb-name-text">${escHtml(r.display_name)}</span>${isMe ? '<span class="lb-you">你</span>' : ''}</div>
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

// get_leaderboard() gives avatar_path only for a file in the owner's own
// avatars folder (NULL otherwise), so the board never loads an address another
// user typed in; a NULL path shows the initial.
async function _withAvatarUrls(rows) {
  const resolved = await Promise.all(rows.map(async row => {
    if (!row.avatar_path) return { ...row, avatar_display_url: null };
    try {
      const { data, error } = await supabase.storage
        .from('avatars')
        .createSignedUrl(row.avatar_path, 60 * 60 * 24 * 7);
      if (error) throw error;
      return { ...row, avatar_display_url: data?.signedUrl || null };
    } catch {
      return { ...row, avatar_display_url: null };
    }
  }));
  return resolved;
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

function escAttr(str) {
  return escHtml(str).replace(/'/g, '&#39;');
}
