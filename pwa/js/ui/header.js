// App header renderer: avatar, name, level, title (incl. dynamic breathing
// title), XP bar, energy bar. Moved verbatim from app.js.

import { state } from '../state.js';
import { getLevelInfo, getDisplayTitle } from '../leveling.js';
import {
  calculateBreathingProfile, getBreathingTitle,
  loadBreathingFlowState, showBreathingInfoModal,
} from '../titleBreathing.js';
import { effectiveToday } from '../utils.js';

export function updateHeader() {
  if (!state.user) return;
  const info = getLevelInfo(state.user.totalXP || 0);

  // Avatar
  const avatarEl = document.getElementById('hdr-avatar');
  if (avatarEl) {
    if (state.user.avatar) {
      avatarEl.innerHTML = `<img src="${state.user.avatar}" alt="avatar">`;
    } else {
      avatarEl.textContent = (state.user.name?.[0] || '?').toUpperCase();
    }
  }

  const nameEl = document.getElementById('hdr-user-name');
  if (nameEl) nameEl.textContent = state.user.name || '使用者';
  document.getElementById('hdr-level').textContent = `Lv.${info.level}`;

  const _titleEl   = document.getElementById('hdr-title');
  const _infoBtnEl = document.getElementById('hdr-breathing-info-btn');
  if ((state.user.titleTemplate || 'rpg') === 'kny_dynamic') {
    const _today   = effectiveToday(state.user.newDayHour ?? 5);
    const _bProf   = calculateBreathingProfile({
      sessions:   state.sessions,
      tasks:      state.tasks,
      level:      info.level,
      streakDays: state.user.streakDays || 0,
      today:      _today,
    });
    const _bState  = loadBreathingFlowState();
    const _bTitle  = getBreathingTitle({ level: info.level, profile: _bProf, previousFlow: _bState.currentFlow || null });
    if (_titleEl)   _titleEl.textContent = _bTitle.displayTitle || getDisplayTitle(info.level, state.user);
    if (_infoBtnEl) {
      _infoBtnEl.style.display = 'inline-flex';
      _infoBtnEl.onclick = () => showBreathingInfoModal({ profile: _bProf, level: info.level, titleResult: _bTitle });
    }
    // State persistence is handled by renderProfile; updateHeader only reads.
  } else {
    if (_titleEl)   _titleEl.textContent = getDisplayTitle(info.level, state.user);
    if (_infoBtnEl) _infoBtnEl.style.display = 'none';
  }

  document.getElementById('hdr-xp-fill').style.width = info.percent + '%';
  document.getElementById('hdr-xp-text').textContent = `${info.currentXP} / ${info.needed} XP`;

  // Energy bar
  const energy = state.energy;
  const energyPct = Math.round((energy.currentEnergy / (energy.maxEnergy || 100)) * 100);
  const fill = document.getElementById('hdr-energy-fill');
  const txt  = document.getElementById('hdr-energy-text');
  if (fill) {
    fill.style.width = energyPct + '%';
    fill.className = 'energy-bar-fill' +
      (energyPct >= 60 ? ' energy-high' : energyPct >= 30 ? ' energy-mid' : ' energy-low');
  }
  if (txt) txt.textContent = energy.currentEnergy;
}
