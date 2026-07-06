// titleBreathing.js
// Dynamic breathing-style title system (鬼滅之刃・呼吸流派)
// Activated only when user.titleTemplate === 'kny_dynamic'

import { calcDailyStats } from './engine.js';

// ─── BREATHING_FLOWS ─────────────────────────────────────────────────────────

export const BREATHING_FLOWS = {
  water: {
    key:          'water',
    label:        '水之呼吸',
    character:    '水の呼吸使い',
    tendency:     '穩定、均衡、持續累積',
    howToIncrease: '每天完成 A/S 任務、保持連勝',
    unlockRule:   '無特殊解鎖條件',
  },
  flame: {
    key:          'flame',
    label:        '炎之呼吸',
    character:    '炎の柱',
    tendency:     '高價值輸出、強攻突破',
    howToIncrease: '完成 S 級任務、挑戰高阻力任務',
    unlockRule:   '無特殊解鎖條件',
  },
  thunder: {
    key:          'thunder',
    label:        '雷之呼吸',
    character:    '雷の迅閃',
    tendency:     '短時間爆發、快速完成',
    howToIncrease: '大量完成 instant 類型任務',
    unlockRule:   '無特殊解鎖條件',
  },
  stone: {
    key:          'stone',
    label:        '岩之呼吸',
    character:    '岩の守柱',
    tendency:     '高阻力、高難度、硬扛',
    howToIncrease: '完成阻力 1.4、難度 1.0 的任務',
    unlockRule:   '無特殊解鎖條件',
  },
  mist: {
    key:          'mist',
    label:        '霞之呼吸',
    character:    '霞の思索者',
    tendency:     '深度專注、抽象思考',
    howToIncrease: '完成 focus 類型 45 分鐘以上任務、閱讀/學習',
    unlockRule:   '無特殊解鎖條件',
  },
  wind: {
    key:          'wind',
    label:        '風之呼吸',
    character:    '風の奔走者',
    tendency:     '高頻推進、連續完成',
    howToIncrease: '每天完成大量任務、保持高頻節奏',
    unlockRule:   '無特殊解鎖條件',
  },
  beast: {
    key:          'beast',
    label:        '獸之呼吸',
    character:    '獸の本能者',
    tendency:     '身體行動、直覺執行',
    howToIncrease: '完成運動相關任務',
    unlockRule:   '無特殊解鎖條件',
  },
  insect: {
    key:          'insect',
    label:        '蟲之呼吸',
    character:    '蟲の精準者',
    tendency:     '精準處理、小步修正',
    howToIncrease: '完成整理/記帳/行政/回覆等細節任務',
    unlockRule:   '無特殊解鎖條件',
  },
  sound: {
    key:          'sound',
    label:        '音之呼吸',
    character:    '音の節奏者',
    tendency:     '節奏管理、週期穩定',
    howToIncrease: '完成 90 分鐘以上任務、維持 7 天以上連勝',
    unlockRule:   '無特殊解鎖條件',
  },
  sun: {
    key:          'sun',
    label:        '日之呼吸',
    character:    '始まりの呼吸使い',
    tendency:     '多流派整合、長期高表現',
    howToIncrease: 'Lv.50 後，維持 70% 有效日率，S/A 任務占 60% 以上',
    unlockRule:   'Lv.50+、近30天有效日率≥70%、S/A XP占≥60%、前3流派占≥75%、主流派占<45%',
  },
};

// ─── BREATHING_TECHNIQUES ────────────────────────────────────────────────────

export const BREATHING_TECHNIQUES = {
  water: [
    '壹之型・水面切',
    '貳之型・水車',
    '參之型・流流舞',
    '肆之型・擊打潮',
    '伍之型・乾天の慈雨',
    '陸之型・扭轉漩渦',
    '漆之型・雫波紋擊刺',
    '捌之型・瀧壺',
    '玖之型・水流飛沫・亂',
    '拾之型・生生流轉',
    '拾壹之型・凪',
  ],
  flame: [
    '壹之型・不知火',
    '貳之型・上昇炎天',
    '參之型・氣炎萬象',
    '肆之型・盛炎之渦卷',
    '伍之型・炎虎',
    '奧義 玖之型・煉獄',
  ],
  thunder: [
    '壹之型・霹靂一閃',
    '霹靂一閃 六連',
    '霹靂一閃 八連',
    '霹靂一閃 神速',
    '貳之型・稻魂',
    '參之型・聚蚊成雷',
    '肆之型・遠雷',
    '伍之型・熱界雷',
    '陸之型・電轟雷轟',
    '漆之型・火雷神',
  ],
  stone: [
    '壹之型・蛇紋岩・雙極',
    '貳之型・天面砕',
    '參之型・岩軀之膚',
    '肆之型・流紋岩・速征',
    '伍之型・瓦輪刑部',
  ],
  mist: [
    '壹之型・垂天遠霞',
    '貳之型・八重霞',
    '參之型・霞散飛沫',
    '肆之型・移流斬',
    '伍之型・霞雲之海',
    '陸之型・月之霞消',
    '柒之型・朧',
  ],
  wind: [
    '壹之型・塵旋風・削斬',
    '貳之型・爪爪・科戶風',
    '參之型・晴嵐風樹',
    '肆之型・昇上砂塵嵐',
    '伍之型・木枯颪',
    '陸之型・黑風煙嵐',
    '漆之型・勁風・天狗風',
    '捌之型・初烈風斬',
    '玖之型・韋馱天颱風',
  ],
  beast: [
    '壹之牙・穿透刺射',
    '貳之牙・利刀對劈',
    '參之牙・獠牙撕扯',
    '肆之牙・碎刀霏霏',
    '伍之牙・狂牙綻裂',
    '陸之牙・亂樁撕咬',
    '漆之型・空間識覺',
    '捌之型・爆裂猛進',
    '玖之牙・伸・蜿蜿長蛇',
    '拾之牙・圓轉旋牙',
  ],
  insect: [
    '蝶之舞・戲弄',
    '蜂牙之舞・真曳',
    '蜻蜓之舞・複眼六角',
    '蜈蚣之舞・百足蛇腹',
  ],
  sound: [
    '壹之型・轟',
    '肆之型・響斬無間',
    '伍之型・鳴弦奏奏',
    '譜面完成',
    '華麗連奏',
  ],
  sun: [
    '圓舞',
    '圓舞一閃',
    '碧羅之天',
    '烈日紅鏡',
    '灼骨炎陽',
    '陽華突',
    '日暈之龍・頭舞',
    '斜陽轉身',
    '飛輪陽炎',
    '輝輝恩光',
    '火車',
    '幻日虹',
    '炎舞',
    '拾參之型',
  ],
};

// ─── Technique index by level ─────────────────────────────────────────────────
// Lv.1–20:  every 2 levels → indices 0–9  (10 stages)
// Lv.21–50: every 3 levels → indices 10–19 (10 stages)
// Lv.51–80: every 5 levels → indices 20–25 (6 stages)
// Lv.81–120: every 10 levels → indices 26–29 (4 stages)

function _techniqueIndex(level) {
  if (level <= 20) return Math.floor((level - 1) / 2);
  if (level <= 50) return 10 + Math.floor((level - 21) / 3);
  if (level <= 80) return 20 + Math.floor((level - 51) / 5);
  return 26 + Math.floor((level - 81) / 10);
}

export function getTechnique(flow, level) {
  const list = BREATHING_TECHNIQUES[flow];
  if (!list?.length) return '';
  return list[Math.min(_techniqueIndex(level), list.length - 1)];
}

// ─── calculateBreathingProfile ───────────────────────────────────────────────
// Returns the behavior profile for the last 30 days.
// Sessions from the last 7 days get a 1.25× recency boost.

export function calculateBreathingProfile({ sessions, tasks, level, streakDays, today }) {
  const refDate  = today ? new Date(today + 'T00:00:00') : new Date();
  const todayStr = refDate.toLocaleDateString('sv');

  const cut30 = new Date(refDate); cut30.setDate(cut30.getDate() - 30);
  const cut7  = new Date(refDate); cut7.setDate(cut7.getDate() - 7);
  const cut30Str = cut30.toLocaleDateString('sv');
  const cut7Str  = cut7.toLocaleDateString('sv');

  const taskMap = Object.fromEntries((tasks || []).map(t => [t.id, t]));

  const scores = { water: 0, flame: 0, thunder: 0, stone: 0, mist: 0,
                   wind: 0, beast: 0, insect: 0, sound: 0, sun: 0 };

  const recent30 = (sessions || []).filter(
    s => s.isProductiveXP && s.date >= cut30Str && s.date <= todayStr
  );

  for (const s of recent30) {
    const task = taskMap[s.taskId] || {};
    const name = task.name || s.taskName || '';
    const mult = s.date >= cut7Str ? 1.25 : 1.0;
    const res  = Number(task.resistance) || 1.0;
    const diff = Number(task.difficulty) || 0.7;

    // Value
    if (task.value === 'S') scores.flame  += 55 * mult;
    if (task.value === 'A') scores.water  += 30 * mult;
    if (task.value === 'B') scores.insect += 25 * mult;

    // Resistance / difficulty
    if (res  >= 1.4) scores.stone += 55 * mult;
    if (res  >= 1.2) scores.flame += 20 * mult;
    if (diff >= 1.0) scores.stone += 25 * mult;

    // Category / duration
    if (task.category === 'focus')    scores.mist    += 35 * mult;
    if (s.durationMinutes >= 45)      scores.mist    += 30 * mult;
    if (s.durationMinutes >= 90)      scores.sound   += 20 * mult;
    if (task.category === 'instant')  scores.thunder += 35 * mult;

    // Task name keywords
    if (/運動/.test(name))      scores.beast  += 60 * mult;
    if (/閱讀|學習/.test(name)) scores.mist   += 35 * mult;
    if (/整理|記帳/.test(name)) scores.insect += 35 * mult;
    if (/行政|回覆/.test(name)) scores.insect += 40 * mult;
  }

  // Global streak bonuses (applied once, not per session)
  if (streakDays >= 7)  scores.sound += 10;
  if (streakDays >= 30) scores.sun   += 10;

  // Normalize to percentages
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const flows = {};
  for (const [key, score] of Object.entries(scores)) {
    flows[key] = { score, pct: total > 0 ? Math.round((score / total) * 100) : 0 };
  }

  // ── Sun unlock check ──────────────────────────────────────────────────────
  let sunUnlocked = false;
  if (level >= 50 && recent30.length >= 5) {
    // Effective day rate ≥ 70% (last 30 days)
    let effectiveDays = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(refDate); d.setDate(d.getDate() - i);
      if (calcDailyStats(sessions || [], d.toLocaleDateString('sv')).isEffectiveDay) effectiveDays++;
    }

    // S/A task productive XP ≥ 60%
    const totalXP = recent30.reduce((a, s) => a + (s.finalXP || 0), 0);
    const saXP    = recent30
      .filter(s => { const t = taskMap[s.taskId] || {}; return t.value === 'S' || t.value === 'A'; })
      .reduce((a, s) => a + (s.finalXP || 0), 0);

    // Top-3 flows combined ≥ 75%
    const sortedPct = Object.values(flows).map(f => f.pct).sort((a, b) => b - a);
    const top3pct   = sortedPct.slice(0, 3).reduce((a, b) => a + b, 0);

    // Top-1 non-sun flow < 45% (prevents one flow dominating while sun sneaks in)
    const top1NonSun = Object.entries(flows)
      .filter(([k]) => k !== 'sun')
      .sort((a, b) => b[1].pct - a[1].pct)[0]?.[1].pct ?? 0;

    sunUnlocked =
      effectiveDays / 30 >= 0.7 &&
      (totalXP > 0 ? saXP / totalXP : 0) >= 0.6 &&
      top3pct >= 75 &&
      top1NonSun < 45;
  }

  const ranked = Object.entries(flows)
    .map(([key, { pct }]) => ({ key, pct }))
    .sort((a, b) => b.pct - a.pct);

  return {
    flows,
    ranked,
    sunUnlocked,
    hasEnoughData: recent30.length >= 5,
    sessionCount:  recent30.length,
  };
}

// ─── getBreathingTitle ────────────────────────────────────────────────────────
// Determines the display title from a profile.
// previousFlow gets a sticky +8 pct bonus to avoid daily title flicker.
// Sun is excluded from the top position unless sunUnlocked.

export function getBreathingTitle({ level, profile, previousFlow }) {
  if (!profile?.hasEnoughData) {
    return {
      flow: null, flow2: null, displayTitle: null,
      isTraining: true, isDual: false,
      reason: `資料不足（有效任務 ${profile?.sessionCount ?? 0} / 5 筆）`,
    };
  }

  // Apply sticky bonus for previousFlow, suppress sun if locked
  const adjusted = profile.ranked.map(r => ({
    key: r.key,
    pct: (r.pct + (r.key === previousFlow ? 8 : 0)) *
         (r.key === 'sun' && !profile.sunUnlocked ? 0 : 1),
  })).sort((a, b) => b.pct - a.pct);

  if (!adjusted.length) {
    return { flow: null, flow2: null, displayTitle: '全集中修練中', isTraining: true, isDual: false, reason: '無行為數據' };
  }

  const top1 = adjusted[0];
  const top2 = adjusted[1];
  const gap  = top2 ? top1.pct - top2.pct : 100;

  let flow = null, flow2 = null;
  let isDual = false, isTraining = false;
  let reason = '';

  if (top1.pct < 28) {
    isTraining = true;
    reason = `最高流派佔比 ${top1.pct}%，未達28%閾值`;
  } else if (top1.pct >= 38 && gap >= 10) {
    flow   = top1.key;
    reason = `${BREATHING_FLOWS[flow].label} 佔 ${profile.flows[flow].pct}%，領先 ${gap}%`;
  } else if (top2 && top2.pct >= 25 && gap <= 12) {
    flow   = top1.key;
    flow2  = top2.key;
    isDual = true;
    reason = `${BREATHING_FLOWS[flow].label} ${profile.flows[flow].pct}% ↔ ${BREATHING_FLOWS[flow2].label} ${profile.flows[flow2].pct}%，差距 ${gap}%`;
  } else {
    flow   = top1.key;
    reason = `${BREATHING_FLOWS[flow].label} 佔 ${profile.flows[flow].pct}%`;
  }

  if (isTraining) {
    return { flow: null, flow2: null, displayTitle: '全集中修練中', isTraining: true, isDual: false, reason };
  }

  const technique = getTechnique(flow, level);

  let displayTitle;
  if (isDual) {
    const l1 = BREATHING_FLOWS[flow].label.replace('之呼吸', '');
    const l2 = BREATHING_FLOWS[flow2].label.replace('之呼吸', '');
    displayTitle = `${l1}${l2}之呼吸・${technique}`;
  } else {
    displayTitle = `${BREATHING_FLOWS[flow].label}・${technique}`;
  }

  return { flow, flow2, technique, displayTitle, isTraining: false, isDual, reason, adjusted };
}

// ─── Flow state persistence ───────────────────────────────────────────────────
// State shape: { currentFlow, candidateFlow, candidateDays, lastDate }

export function loadBreathingFlowState() {
  try {
    return JSON.parse(localStorage.getItem('orbit_breathing_flow') || '{}');
  } catch {
    return {};
  }
}

export function saveBreathingFlowState(s) {
  try { localStorage.setItem('orbit_breathing_flow', JSON.stringify(s)); } catch { /* storage full — skip persist */ }
}

// Called once per day to advance the stability logic.
// A new flow must win 3 consecutive days before replacing currentFlow.
export function updateBreathingFlowState(today, winnerFlow, currentState) {
  if (!winnerFlow) return currentState || loadBreathingFlowState();
  const s = currentState ? { ...currentState } : loadBreathingFlowState();
  if (s.lastDate === today) return s;  // already processed today

  s.lastDate = today;

  if (!s.currentFlow) {
    // First time: set immediately
    s.currentFlow    = winnerFlow;
    s.candidateFlow  = null;
    s.candidateDays  = 0;
  } else if (winnerFlow === s.currentFlow) {
    // Current flow retained
    s.candidateFlow = null;
    s.candidateDays = 0;
  } else if (winnerFlow === s.candidateFlow) {
    // Challenger advancing
    s.candidateDays = (s.candidateDays || 0) + 1;
    if (s.candidateDays >= 3) {
      s.currentFlow   = winnerFlow;
      s.candidateFlow = null;
      s.candidateDays = 0;
    }
  } else {
    // New challenger resets the count
    s.candidateFlow = winnerFlow;
    s.candidateDays = 1;
  }

  saveBreathingFlowState(s);
  return s;
}

// ─── Modal UI ─────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function showBreathingInfoModal({ profile, titleResult }) {
  if (typeof document === 'undefined') return;

  document.getElementById('breathing-info-modal')?.remove();

  const flowEntries = Object.entries(profile.flows)
    .sort((a, b) => b[1].pct - a[1].pct);

  const barsHtml = flowEntries.map(([key, { pct }]) => {
    const f        = BREATHING_FLOWS[key];
    const isMain   = key === titleResult?.flow;
    const isSub    = key === titleResult?.flow2;
    const crown    = isMain ? ' ★' : isSub ? ' ☆' : '';
    const barCls   = isMain ? 'br-bar-fill br-bar-main' : isSub ? 'br-bar-fill br-bar-sub' : 'br-bar-fill';
    const locked   = key === 'sun' && !profile.sunUnlocked ? ' 🔒' : '';
    return `
      <div class="br-flow-row">
        <span class="br-flow-name">${_esc(f.label)}${crown}${locked}</span>
        <div class="br-bar-track">
          <div class="${barCls}" style="width:${pct}%"></div>
        </div>
        <span class="br-pct-val">${pct}%</span>
      </div>`;
  }).join('');

  const tableRows = Object.values(BREATHING_FLOWS).map(f => {
    const isActive = f.key === titleResult?.flow || f.key === titleResult?.flow2;
    const locked   = f.key === 'sun' && !profile.sunUnlocked ? '<span class="br-locked-badge">🔒 未解鎖</span>' : '';
    return `
      <tr class="${isActive ? 'br-row-active' : ''}">
        <td class="br-td-name">${_esc(f.label)}${locked}</td>
        <td class="br-td-tend">${_esc(f.tendency)}</td>
        <td class="br-td-how">${_esc(f.howToIncrease)}</td>
      </tr>`;
  }).join('');

  const titleLine = titleResult?.displayTitle
    ? `<div class="br-current-title">${_esc(titleResult.displayTitle)}</div>`
    : `<div class="br-current-title" style="color:var(--text-muted)">全集中修練中</div>`;

  const dualLine = titleResult?.flow2
    ? `<div class="br-sub-flow">副流派：${_esc(BREATHING_FLOWS[titleResult.flow2].label)}</div>`
    : '';

  const sunNote = !profile.sunUnlocked ? `
    <div class="br-note-row">
      🔒 日之呼吸解鎖條件：Lv.50+、近30天有效日率≥70%、S/A XP占≥60%、前3流派≥75%、主流派&lt;45%
    </div>` : '';

  const modal = document.createElement('div');
  modal.id = 'breathing-info-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box br-modal-box">
      <div class="modal-header">
        <span class="modal-title">⛩️ 呼吸流派判定</span>
        <button class="modal-close" id="br-modal-close">✕</button>
      </div>

      <div class="br-section">
        <div class="br-section-lbl">目前稱號</div>
        ${titleLine}
        ${dualLine}
        <div class="br-reason">${_esc(titleResult?.reason || '')}</div>
      </div>

      <div class="br-section">
        <div class="br-section-lbl">最近 30 天流派比例（${profile.sessionCount} 筆有效任務）</div>
        ${barsHtml}
      </div>

      <div class="br-section">
        <div class="br-section-lbl">所有流派特性</div>
        <div class="br-table-wrap">
          <table class="br-table">
            <thead>
              <tr>
                <th>流派</th>
                <th>行為傾向</th>
                <th>如何提升</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>

      ${sunNote}

      <div class="br-footer-note">
        稱號由最近 30 天任務行為判定，等級決定招式階段。<br>
        ★ 主流派&#12288;☆ 副流派（雙流派時顯示）
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#br-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
