import { state }                                              from './state.js';
import { storage, db, migrateV1toV2, migrateDefaultFlags }    from './storage.js';
import { signIn, signUp, signInWithGoogle, signOut as authSignOut, getSession, onAuthStateChange, resetPasswordForEmail, updatePassword } from './auth.js';
import { updateHeader } from './ui/header.js';

// Re-export so existing importers (profile.js via dynamic import, tests) keep working.
export { updateHeader };
import { getMinEffectiveMinutes } from './engine.js';
import { submitFocusResult, setBadgeUpdater } from './sessionFlow.js';
import { uid, today } from './utils.js';
import {
  eToday, processYesterdayStreak, showStreakUnlockModal,
  showDailyReport, showMorningModal, checkWeeklyBonus, startDayWatcher,
} from './dayCycle.js';
import { createDefaultTasks }   from './defaultTasks.js';
import { renderPage, currentHash, isTextInputTarget, isTextInputActive, markTextInputFocus } from './router.js';
import { haptic } from './platform/haptics.js';
import { applyTimeBand }        from './timeBand.js';
import { showToast, showXPFloat, showSyncBanner } from './ui/feedback.js';
import { applyRandomThemeForToday, renderBg, initLiquidGlassReflection } from './theme.js';

// Re-export so existing importers (pages via dynamic import) keep working.
export { showToast, showXPFloat, showSyncBanner };

// ─── Version ─────────────────────────────────────────────────────────────────
export { APP_VERSION } from './version.js';

// Lazy proxy — tour.js is not imported at startup; loaded on first call.
window.startTour = () =>
  import('./tour.js')
    .then(m => m.startTour())
    .catch(() => showToast('導覽載入失敗'));

// ─── Auth session state ───────────────────────────────────────────────────────
let _currentSession   = null;
let _isGuest          = false;
let _loginListenerSet = false;

// ─── Daily Plan ───────────────────────────────────────────────────────────────

window.addToDailyPlan = function (taskId) {
  if (state.dailyPlan.includes(taskId)) {
    showToast('任務已在計劃中');
    return;
  }
  state.dailyPlan.push(taskId);
  storage.saveDailyPlan(state.dailyPlan);
  showToast('✓ 已加入本日計劃');
  renderPage(currentHash());
};

window.removeFromDailyPlan = function (taskId) {
  state.dailyPlan = state.dailyPlan.filter(id => id !== taskId);
  storage.saveDailyPlan(state.dailyPlan);
  renderPage(currentHash());
};

// ─── Focus timer state ───────────────────────────────────────────────────────

const focus = {
  active:            false,
  taskId:            null,
  startTime:         null,
  elapsedSec:        0,
  intervalId:        null,
  minEffectiveSec:   0,
  paused:            false,
  pausedAt:          null,
  deskMode:          false,
  deskStableSince:   0,
  deskMotionCleanup: null,
  deskAutoSuppressed: false,
};

let _focusDeskToggleAt = 0;

const SKIP_MESSAGES = [
  '成長是對自己的負責，確定已完成任務？',
  '誠實是成長的起點，你真的完成了嗎？',
  '記錄的是習慣，不是數字，確認已完成？',
  '你的未來自我會感謝今天的誠實，確定完成了？',
  '只有自己知道答案，確定已完成任務？',
];

window.startFocus = function (taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (focus.active) {
    showToast('⚡ 已有任務進行中，請先完成或略過');
    return;
  }

  if (storage.isProUser()) {
    _showDurationPicker(taskId, task);
  } else {
    _launchFocus(taskId, task, null);
  }
};

function _showDurationPicker(taskId, task) {
  const picker = document.getElementById('focus-duration-picker');
  const defaultMin = state.user?.focusDefaultMinutes ?? null;
  const customInput = document.getElementById('focus-dur-custom');
  const minEffectiveMin = getMinEffectiveMinutes(task.difficulty);

  // Show recommended minimum hint
  let hintEl = picker.querySelector('.focus-dur-hint');
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.className = 'focus-dur-hint';
    picker.querySelector('.focus-dur-presets').insertAdjacentElement('beforebegin', hintEl);
  }
  hintEl.textContent = `💡 此任務建議最少 ${minEffectiveMin} 分鐘`;

  // Warning element
  let warnEl = picker.querySelector('.focus-dur-warn');
  if (!warnEl) {
    warnEl = document.createElement('div');
    warnEl.className = 'focus-dur-warn';
    picker.querySelector('.focus-dur-actions').insertAdjacentElement('beforebegin', warnEl);
  }
  warnEl.textContent = '';

  // Highlight saved default
  picker.querySelectorAll('.focus-dur-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.min) === defaultMin);
  });
  if (defaultMin && !picker.querySelector(`.focus-dur-btn[data-min="${defaultMin}"]`)) {
    customInput.value = defaultMin;
  } else {
    customInput.value = '';
  }

  picker.classList.remove('hidden');

  function getSelectedMin() {
    const active = picker.querySelector('.focus-dur-btn.active');
    if (active) return Number(active.dataset.min);
    const v = parseInt(customInput.value, 10);
    return (!isNaN(v) && v > 0) ? v : null;
  }

  function updateWarn() {
    const min = getSelectedMin();
    warnEl.textContent = (min && min < minEffectiveMin)
      ? '⚠ 低於建議時間，對成長的實際幫助較低'
      : '';
  }

  picker.querySelectorAll('.focus-dur-btn').forEach(btn => {
    btn.onclick = () => {
      picker.querySelectorAll('.focus-dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customInput.value = '';
      updateWarn();
    };
  });

  customInput.oninput = () => {
    picker.querySelectorAll('.focus-dur-btn').forEach(b => b.classList.remove('active'));
    updateWarn();
  };

  updateWarn();

  document.getElementById('focus-dur-confirm').onclick = () => {
    const min = getSelectedMin();
    picker.classList.add('hidden');
    if (min) {
      state.user.focusDefaultMinutes = min;
      storage.saveUser(state.user);
    }
    _launchFocus(taskId, task, min ?? null);
  };

  document.getElementById('focus-dur-skip').onclick = () => {
    picker.classList.add('hidden');
    _launchFocus(taskId, task, null);
  };
}

function _ensureFocusDeskButton() {
  const box = document.querySelector('#focus-overlay .focus-box');
  if (!box) return;
  const existing = document.getElementById('focus-desk-btn');
  if (existing) {
    existing.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - _focusDeskToggleAt < 350) return;
      _focusDeskToggleAt = now;
      window.toggleFocusDeskMode();
    };
    return;
  }
  const skipBtn = box.querySelector('.focus-skip-btn');
  const btn = document.createElement('button');
  btn.id = 'focus-desk-btn';
  btn.className = 'focus-desk-btn';
  btn.type = 'button';
  btn.setAttribute('aria-pressed', 'false');
  btn.textContent = '桌面模式';
  const toggle = event => {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - _focusDeskToggleAt < 350) return;
    _focusDeskToggleAt = now;
    window.toggleFocusDeskMode();
  };
  btn.addEventListener('pointerup', toggle);
  btn.addEventListener('touchend', toggle);
  btn.addEventListener('click', toggle);
  box.insertBefore(btn, skipBtn || null);
}

function _setFocusDeskMode(enabled, source = 'manual') {
  focus.deskMode = Boolean(enabled);
  if (source === 'manual' && !focus.deskMode) {
    focus.deskAutoSuppressed = true;
    focus.deskStableSince = 0;
  }
  const overlay = document.getElementById('focus-overlay');
  const btn = document.getElementById('focus-desk-btn');
  if (overlay) overlay.classList.toggle('focus-desk-mode', focus.deskMode);
  if (btn) {
    btn.setAttribute('aria-pressed', focus.deskMode ? 'true' : 'false');
    btn.textContent = focus.deskMode ? '退出桌面模式' : '桌面模式';
  }
  if (source === 'manual') haptic('tap');
}

function _looksLikePhoneRestingFlat(event) {
  const beta = Number(event.beta);
  const gamma = Number(event.gamma);
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return false;
  const flatScreenUp = Math.abs(beta) < 18 && Math.abs(gamma) < 18;
  const flatLandscape = Math.abs(Math.abs(beta) - 90) < 12 && Math.abs(gamma) < 12;
  return flatScreenUp || flatLandscape;
}

function _startFocusDeskSensors() {
  if (focus.deskMotionCleanup || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

  let rafId = 0;
  let lastEvent = null;
  const onOrientation = event => {
    lastEvent = event;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!focus.active || !lastEvent) return;
      if (_looksLikePhoneRestingFlat(lastEvent)) {
        focus.deskStableSince ||= Date.now();
        if (!focus.deskAutoSuppressed && !focus.deskMode && Date.now() - focus.deskStableSince > 1200) {
          _setFocusDeskMode(true, 'sensor');
        }
      } else {
        focus.deskStableSince = 0;
        focus.deskAutoSuppressed = false;
      }
    });
  };

  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  focus.deskMotionCleanup = () => {
    window.removeEventListener('deviceorientation', onOrientation);
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}

async function _requestFocusDeskSensors() {
  const OrientationEvent = window.DeviceOrientationEvent;
  if (typeof OrientationEvent !== 'undefined' &&
      typeof OrientationEvent.requestPermission === 'function') {
    try {
      const result = await OrientationEvent.requestPermission();
      if (result !== 'granted') return;
    } catch { return; }
  }
  _startFocusDeskSensors();
}

function _prepareFocusDeskMode() {
  _ensureFocusDeskButton();
  focus.deskStableSince = 0;
  focus.deskAutoSuppressed = false;
  _setFocusDeskMode(false, 'reset');
  _requestFocusDeskSensors();
}

function _stopFocusDeskMode() {
  _setFocusDeskMode(false, 'reset');
  focus.deskStableSince = 0;
  focus.deskAutoSuppressed = false;
  if (focus.deskMotionCleanup) {
    focus.deskMotionCleanup();
    focus.deskMotionCleanup = null;
  }
}

window.toggleFocusDeskMode = async function () {
  if (!focus.active) return;
  await _requestFocusDeskSensors();
  _setFocusDeskMode(!focus.deskMode, 'manual');
};

function _launchFocus(taskId, task, targetMin) {
  haptic('focusStart');
  focus.active          = true;
  focus.taskId          = taskId;
  focus.startTime       = Date.now();
  focus.elapsedSec      = 0;
  focus.targetSec       = targetMin ? targetMin * 60 : null;
  focus.minEffectiveSec = getMinEffectiveMinutes(task.difficulty) * 60;

  document.getElementById('focus-task-name').textContent = task.name;
  document.getElementById('focus-task-emoji').textContent = task.emoji || '🎯';

  const modeEl = document.getElementById('focus-timer-mode');
  if (focus.targetSec) {
    modeEl.textContent = `目標 ${targetMin} 分鐘`;
    modeEl.className = 'focus-timer-mode focus-timer-mode--countdown';
  } else {
    modeEl.textContent = '';
    modeEl.className = 'focus-timer-mode';
  }

  document.getElementById('focus-overlay').classList.remove('hidden');
  _prepareFocusDeskMode();
  focus.intervalId = setInterval(_tickFocus, 1000);
  _tickFocus();
}

function _tickFocus() {
  focus.elapsedSec = Math.floor((Date.now() - focus.startTime) / 1000);

  // Countdown mode: auto-end when target reached
  if (focus.targetSec && focus.elapsedSec >= focus.targetSec) {
    clearInterval(focus.intervalId);
    document.getElementById('focus-timer').textContent = '00:00';
    _stopFocusDeskMode();
    document.getElementById('focus-overlay').classList.add('hidden');
    document.getElementById('focus-pip').classList.add('hidden');
    _playFocusChime('end');
    _showResultPicker(Math.floor(focus.targetSec / 60));
    return;
  }

  let displaySec, timeStr;
  if (focus.targetSec) {
    displaySec = focus.targetSec - focus.elapsedSec;
    const min = Math.floor(displaySec / 60);
    const sec = displaySec % 60;
    timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  } else {
    const min = Math.floor(focus.elapsedSec / 60);
    const sec = focus.elapsedSec % 60;
    timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  document.getElementById('focus-timer').textContent = timeStr;

  const pipTimer = document.getElementById('focus-pip-timer');
  if (pipTimer) pipTimer.textContent = timeStr;

  const minEl = document.getElementById('focus-min-effective');
  const minSec = focus.minEffectiveSec;
  const justReached = focus.elapsedSec === minSec;
  if (focus.elapsedSec >= minSec) {
    if (justReached) {
      _playFocusChime('milestone');
      haptic('focusMilestone');
    }
    minEl.textContent = '達到最低有效時間 ✓';
    minEl.className = 'focus-min-reached';
    document.getElementById('focus-end-btn').disabled = false;
  } else {
    const remain = minSec - focus.elapsedSec;
    const rm = Math.floor(remain / 60), rs = remain % 60;
    minEl.textContent = `最低有效時間：還需 ${rm}:${String(rs).padStart(2,'0')}`;
    minEl.className = 'focus-min-pending';
    document.getElementById('focus-end-btn').disabled = false;
  }
}

function _playFocusChime(type) {
  if (!storage.isProUser() || state.user?.focusSoundEnabled === false) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = type === 'end' ? [528, 660, 784] : [528, 660];
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.25);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 1.2);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 1.2);
    });
  } catch { /* AudioContext not available */ }
}

window.endFocus = function () {
  if (!focus.active) return;

  const isEffective = focus.elapsedSec >= focus.minEffectiveSec;

  if (!isEffective) {
    // Show confirmation before recording invalid (timer keeps running behind modal)
    haptic('warning');
    _showEarlyEndConfirm();
    return;
  }

  clearInterval(focus.intervalId);
  _stopFocusDeskMode();
  document.getElementById('focus-overlay').classList.add('hidden');
  document.getElementById('focus-pip').classList.add('hidden');
  _showResultPicker(Math.floor(focus.elapsedSec / 60));
};

/** 縮小 overlay，timer 繼續在背景跑。 */
window.minimizeFocus = function () {
  if (!focus.active) return;
  const task = state.tasks.find(t => t.id === focus.taskId);
  _setFocusDeskMode(false, 'reset');
  document.getElementById('focus-pip-emoji').textContent = task?.emoji || '🎯';
  document.getElementById('focus-overlay').classList.add('hidden');
  document.getElementById('focus-pip').classList.remove('hidden');
};

/** 從背景恢復 overlay。 */
window.restoreFocus = function () {
  document.getElementById('focus-pip').classList.add('hidden');
  document.getElementById('focus-overlay').classList.remove('hidden');
};

/** 暫停 / 繼續切換。暫停時停止計時；繼續時補償 startTime。 */
window.togglePauseFocus = function () {
  if (!focus.active) return;
  const btn = document.getElementById('focus-pause-btn');
  if (focus.paused) {
    // 繼續：把暫停的時間長度加回 startTime，避免計入暫停秒數
    focus.startTime += Date.now() - focus.pausedAt;
    focus.pausedAt = null;
    focus.paused = false;
    focus.intervalId = setInterval(_tickFocus, 1000);
    if (btn) btn.textContent = '⏸ 暫停';
  } else {
    // 暫停
    clearInterval(focus.intervalId);
    focus.pausedAt = Date.now();
    focus.paused = true;
    if (btn) btn.textContent = '▶ 繼續';
  }
};

const MOTIVATIONAL_QUOTES = [
  '再撐一下，大腦需要足夠時間進入心流！',
  '困難往往在最後幾分鐘，堅持就是突破！',
  '每一分鐘的投入都在重塑你的大腦神經迴路。',
  '真正的成長發生在你想放棄的那一刻之後。',
  '差一點就達標了，未來的你會感謝你留下來。',
  '最後衝刺往往是最有價值的部分。',
];

function _showEarlyEndConfirm() {
  const minMin  = Math.ceil(focus.minEffectiveSec / 60);
  const quote   = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

  const modal   = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'early-end-confirm';
  modal.innerHTML = `
    <div class="modal-box" style="text-align:center">
      <div style="font-size:36px;margin-bottom:12px">⏱️</div>
      <p style="font-weight:600;margin-bottom:6px">未達最低時長（${minMin} 分鐘）</p>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">結束後本次不會累積 XP</p>
      <div class="motivational-quote">"${quote}"</div>
      <div class="skip-confirm-actions" style="margin-top:20px">
        <button class="btn btn-primary" id="early-keep-going">繼續加油 💪</button>
        <button class="btn btn-outline" id="early-end-confirm-btn">確定結束</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.zIndex = '200';

  modal.querySelector('#early-keep-going').addEventListener('click', () => modal.remove());

  modal.querySelector('#early-end-confirm-btn').addEventListener('click', () => {
    modal.remove();
    clearInterval(focus.intervalId);
    const dur = Math.floor(focus.elapsedSec / 60);
    _stopFocusDeskMode();
    document.getElementById('focus-overlay').classList.add('hidden');
    document.getElementById('focus-pip').classList.add('hidden');
    _submitFocusResult('invalid', dur);
  });
}

/** 略過：已在 app 外完成任務後補打卡。顯示確認語 + 時長選擇器。 */
window.skipFocus = function () {
  if (!focus.active) return;
  const msg = SKIP_MESSAGES[Math.floor(Math.random() * SKIP_MESSAGES.length)];

  // Preset durations (minutes); default to nearest preset ≥ minEffectiveSec
  const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
  const minMin    = Math.ceil(focus.minEffectiveSec / 60);
  let selected    = DURATIONS.find(d => d >= minMin) || DURATIONS[DURATIONS.length - 1];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'skip-confirm';
  modal.innerHTML = `
    <div class="modal-box" style="text-align:center">
      <div style="font-size:36px;margin-bottom:14px">🌱</div>
      <p class="skip-confirm-msg">${msg}</p>
      <div class="skip-duration-section">
        <p class="skip-duration-label">選擇已完成的時長</p>
        <div class="skip-duration-pills">
          ${DURATIONS.map(m => {
            const label = m >= 60 ? `${m / 60}h` : `${m}m`;
            return `<button class="skip-dur-btn${m === selected ? ' active' : ''}" data-min="${m}">${label}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="skip-confirm-actions">
        <button class="btn btn-primary" id="skip-yes">確認完成</button>
        <button class="btn btn-outline" id="skip-no">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.zIndex = '200'; // must be above focus-overlay (z-index:80)

  modal.querySelectorAll('.skip-dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.skip-dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selected = parseInt(btn.dataset.min, 10);
    });
  });

  modal.querySelector('#skip-yes').addEventListener('click', () => {
    modal.remove();
    clearInterval(focus.intervalId);
    _stopFocusDeskMode();
    document.getElementById('focus-overlay').classList.add('hidden');
    document.getElementById('focus-pip').classList.add('hidden');
    _submitFocusResult('complete', selected);
  });
  modal.querySelector('#skip-no').addEventListener('click', () => modal.remove());
};

function _showResultPicker(durationMin) {
  const isPro = storage.isProUser();
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'result-picker';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">這次專注如何？</span>
      </div>
      <div class="result-options">
        <button class="result-btn result-complete" data-result="complete">
          <span class="result-icon">✅</span>
          <span class="result-label">完成</span>
          <span class="result-desc">達成預定目標</span>
        </button>
        <button class="result-btn result-partial" data-result="partial">
          <span class="result-icon">🔶</span>
          <span class="result-label">部分完成</span>
          <span class="result-desc">進度推進但未完成</span>
        </button>
        <button class="result-btn result-invalid" data-result="invalid">
          <span class="result-icon">❌</span>
          <span class="result-label">無效投入</span>
          <span class="result-desc">大部分時間失焦</span>
        </button>
      </div>
      ${isPro ? `
      <div class="focus-note-row">
        <textarea id="focus-note-input" class="focus-note-input"
          placeholder="備注這次專注…（選填）" maxlength="200" rows="2"></textarea>
      </div>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('.result-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = isPro ? (modal.querySelector('#focus-note-input')?.value.trim() || '') : '';
      modal.remove();
      _submitFocusResult(btn.dataset.result, durationMin, note);
    });
  });
}

/** Focus-timer teardown, then hand settlement to sessionFlow. */
function _submitFocusResult(result, durationMin, note = '') {
  _stopFocusDeskMode();
  focus.active = false;
  submitFocusResult(focus.taskId, focus.elapsedSec, result, durationMin, note);
}

// ─── Trial banner ────────────────────────────────────────────────────────────

function _showTrialBanner() {
  const banner = document.getElementById('trial-banner');
  if (!banner) return;
  if (!storage.isTrialUser()) { banner.classList.add('hidden'); return; }
  const daysLeft = storage.getTrialDaysRemaining();
  if (daysLeft > 5) { banner.classList.add('hidden'); return; }
  if (storage.getTrialBannerDismissDate() === today()) { banner.classList.add('hidden'); return; }

  banner.innerHTML =
    `<span class="trial-banner-text">✦ Pro 試用剩餘 <strong>${daysLeft}</strong> 天</span>` +
    `<button class="trial-banner-cta" onclick="window.navigate('settings')">升級 Pro</button>` +
    `<button class="trial-banner-close" onclick="window._dismissTrialBanner()">✕</button>`;
  banner.classList.remove('hidden');
}

window._dismissTrialBanner = function () {
  storage.saveTrialBannerDismissDate(today());
  document.getElementById('trial-banner')?.classList.add('hidden');
};

window.signOut = async function () {
  try { await authSignOut(); } catch (e) { console.error('signOut error:', e); }
  handleSignOut();
};

// ─── Setup screen ────────────────────────────────────────────────────────────

function showSetup() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  let avatarData = null;

  document.getElementById('setup-avatar-btn').addEventListener('click', () => {
    document.getElementById('setup-avatar-input').click();
  });
  document.getElementById('setup-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      avatarData = ev.target.result;
      const preview = document.getElementById('setup-avatar-preview');
      preview.style.cssText += `;background-image:url(${avatarData});background-size:cover;background-position:center`;
      preview.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('setup-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('setup-name').value.trim();
    if (!name) return;

    state.user = {
      id: _currentSession?.user?.id || uid(), name, avatar: avatarData, totalXP: 0,
      streakDays: 0, lastStreakDate: '', lastWeeklyBonusDate: '',
      morningState: 'normal', newDayHour: 5, createdAt: today(),
    };
    storage.saveUser(state.user);

    if (state.tasks.length === 0) {
      state.tasks = createDefaultTasks();
      storage.saveTasks(state.tasks);
    }

    showMainApp();
    // Ask morning state on first day
    showMorningModal();
    // Show onboarding tour for new users (slight delay so page renders first)
    setTimeout(() => window.startTour(), 600);
  });
}

function showMainApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateHeader();
  renderPage(currentHash());
  startDayWatcher();
  _showTrialBanner();
  if (sessionStorage.getItem('orbit_streak_unlock_new')) {
    sessionStorage.removeItem('orbit_streak_unlock_new');
    setTimeout(showStreakUnlockModal, 800);
  }
  // Warm-load non-critical modules after the initial screen is visible
  warmEnhancementModules();
}

// ─── Login screen ────────────────────────────────────────────────────────────

function hideLoading() {
  document.getElementById('loading-screen').classList.add('hidden');
}

// current tab: 'signin' | 'signup'
let _authTab = 'signin';

window.switchAuthTab = function (tab) {
  _authTab = tab;
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('auth-submit').textContent = tab === 'signin' ? '登入' : '註冊';
  document.getElementById('auth-password').autocomplete =
    tab === 'signin' ? 'current-password' : 'new-password';
  document.getElementById('auth-error').classList.add('hidden');
  const forgotRow = document.getElementById('forgot-pw-row');
  if (forgotRow) forgotRow.style.display = tab === 'signin' ? '' : 'none';
};

window.loginWithGoogle = async function () {
  const error = await signInWithGoogle();
  if (error) showToast('Google 登入失敗：' + (error.message || '請稍後再試'));
};

window.togglePasswordVisibility = function () {
  const input = document.getElementById('auth-password');
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  document.getElementById('pw-eye-show').style.display = isHidden ? 'none' : '';
  document.getElementById('pw-eye-hide').style.display = isHidden ? '' : 'none';
};

// ── Forgot password ───────────────────────────────────────────────────────────

window.showForgotPassword = function () {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'forgot-pw-modal';
  modal.innerHTML = `
    <div class="modal-box">
      <button class="modal-close-btn" aria-label="關閉">✕</button>
      <div class="modal-title">重設密碼</div>
      <p style="font-size:14px;color:var(--text-muted);margin:0 0 16px">
        輸入你的 Email，我們會寄送重設連結。<br>
        <span style="font-size:12px">若你是用 Google 帳號登入，請直接點擊「用 Google 帳號登入」，不需要重設密碼。</span>
      </p>
      <div class="form-group">
        <input class="form-input" id="forgot-pw-email" type="email"
               placeholder="your@email.com" autocomplete="email">
      </div>
      <div id="forgot-pw-msg" style="font-size:13px;margin-bottom:12px;min-height:18px"></div>
      <button class="btn btn-primary" id="forgot-pw-submit" style="width:100%">寄送重設信</button>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.modal-close-btn').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#forgot-pw-submit').addEventListener('click', async () => {
    const email = modal.querySelector('#forgot-pw-email').value.trim();
    const msg   = modal.querySelector('#forgot-pw-msg');
    const btn   = modal.querySelector('#forgot-pw-submit');
    if (!email) { msg.style.color = '#ff6b6b'; msg.textContent = '請輸入 Email'; return; }
    btn.disabled = true;
    btn.textContent = '寄送中…';
    const error = await resetPasswordForEmail(email);
    if (error) {
      msg.style.color = '#ff6b6b';
      msg.textContent = error.message || '寄送失敗，請稍後再試';
      btn.disabled = false;
      btn.textContent = '寄送重設信';
    } else {
      msg.style.color = 'var(--text-muted)';
      msg.textContent = '✓ 已寄出！請查看你的 Email（含垃圾郵件匣）';
      btn.disabled = true;
      btn.textContent = '已寄出';
    }
  });
};

window._showResetPasswordModal = function () {
  // Remove login screen, show reset form
  document.getElementById('login-screen')?.classList.add('hidden');
  document.getElementById('setup-screen')?.classList.add('hidden');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.zIndex = '9999';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">設定新密碼</div>
      <div class="form-group" style="margin-top:12px">
        <label class="form-label">新密碼</label>
        <div class="password-input-wrap">
          <input class="form-input" id="reset-pw-input" type="password"
                 placeholder="至少 6 個字元" minlength="6" autocomplete="new-password">
          <button type="button" class="password-toggle-btn" aria-label="顯示或隱藏密碼"
                  onclick="(()=>{const i=document.getElementById('reset-pw-input');i.type=i.type==='password'?'text':'password';})()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <div id="reset-pw-msg" style="font-size:13px;margin-bottom:12px;min-height:18px"></div>
      <button class="btn btn-primary" id="reset-pw-submit" style="width:100%">更新密碼</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#reset-pw-submit').addEventListener('click', async () => {
    const pw  = modal.querySelector('#reset-pw-input').value;
    const msg = modal.querySelector('#reset-pw-msg');
    const btn = modal.querySelector('#reset-pw-submit');
    if (pw.length < 6) { msg.style.color = '#ff6b6b'; msg.textContent = '密碼至少需要 6 個字元'; return; }
    btn.disabled = true;
    btn.textContent = '更新中…';
    const error = await updatePassword(pw);
    if (error) {
      msg.style.color = '#ff6b6b';
      msg.textContent = error.message || '更新失敗，請稍後再試';
      btn.disabled = false;
      btn.textContent = '更新密碼';
    } else {
      modal.remove();
      showToast('密碼已更新，歡迎回來！');
    }
  });
};

window.continueAsGuest = function () {
  _isGuest = true;
  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');
  state.user      = storage.getUser();
  state.tasks     = storage.getTasks();
  state.sessions  = storage.getSessions();
  state.energy    = storage.getEnergy();
  state.dailyPlan = storage.getDailyPlan();
  if (!state.tasks.length) {
    showSetup();
  } else {
    processYesterdayStreak();
    if (state.energy.lastResetDate !== eToday()) {
      showMainApp(); showDailyReport(() => showMorningModal());
    } else {
      showMainApp();
    }
    checkWeeklyBonus();
  }
};

function _showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showLoginScreen() {
  hideLoading();
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');

  if (_loginListenerSet) return;
  _loginListenerSet = true;

  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn      = document.getElementById('auth-submit');
    btn.disabled   = true;
    document.getElementById('auth-error').classList.add('hidden');

    let error;
    if (_authTab === 'signin') {
      btn.textContent = '登入中…';
      ({ error } = await signIn(email, password));
      if (error) {
        btn.disabled    = false;
        btn.textContent = '登入';
        _showAuthError(
          error.message.includes('Invalid login')
            ? '帳號或密碼錯誤。若你是用 Google 帳號登入，請點上方「用 Google 帳號登入」。'
            : error.message
        );
      }
      // on success → onAuthStateChange fires → loadAndStart
    } else {
      btn.textContent = '註冊中…';
      ({ error } = await signUp(email, password));
      if (error) {
        btn.disabled    = false;
        btn.textContent = '註冊';
        _showAuthError(
          error.message.includes('already registered') ? '此 Email 已註冊，請直接登入' : error.message
        );
      } else {
        // Auto sign-in after sign-up (works when email confirmation is disabled)
        const { error: signInErr } = await signIn(email, password);
        if (signInErr) {
          btn.disabled    = false;
          btn.textContent = '註冊';
          _showAuthError('註冊成功！請用剛設定的密碼登入。');
          window.switchAuthTab('signin');
        }
        // on success → onAuthStateChange fires → loadAndStart
      }
    }
  });
}

async function loadAndStart(session) {
  _currentSession = session;

  // Pull fresh data from Supabase; fall back to localStorage cache if offline
  try {
    await db.loadFromRemote(session.user.id);
  } catch (e) {
    console.warn('Supabase load failed, using localStorage cache:', e);
  }

  state.user      = storage.getUser();
  state.tasks     = storage.getTasks();
  state.sessions  = storage.getSessions();
  state.energy    = storage.getEnergy();
  state.dailyPlan = storage.getDailyPlan();

  // Start 15-day Pro trial for new authenticated users
  if (state.user && !state.user.trialStartedAt) {
    await db.startTrial(session.user.id);
    state.user = storage.getUser() ?? state.user;
  }

  hideLoading();
  document.getElementById('login-screen').classList.add('hidden');

  if (!state.tasks.length) {
    // New user: no tasks yet — show setup to customise profile + seed defaults
    showSetup();
  } else {
    processYesterdayStreak();
    if (state.energy.lastResetDate !== eToday()) {
      showMainApp();
      showDailyReport(() => showMorningModal());
    } else {
      showMainApp();
    }
    checkWeeklyBonus();
  }
}

function handleSignOut() {
  if (!_currentSession && !storage.getUser()) return; // already signed out
  _currentSession   = null;
  _isGuest          = false;
  _loginListenerSet = false;
  state.user     = null;
  state.tasks    = [];
  state.sessions = [];
  state.energy   = { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' };
  storage.clearAll();
  if (_badgeMod) _badgeMod.clearBadge().catch(() => {});

  // Clear login form fields
  const emailEl = document.getElementById('auth-email');
  if (emailEl) emailEl.value = '';
  const pwEl = document.getElementById('auth-password');
  if (pwEl) pwEl.value = '';

  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('setup-screen').classList.add('hidden');
  showLoginScreen();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Sync the app shell to the real visible viewport height on mobile browsers.
// visualViewport is more reliable on Chrome when the address bar expands/collapses.
function _syncAppHeight() {
  if (isTextInputActive()) return;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const sab = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0;
  document.documentElement.style.setProperty('--app-height', Math.round(viewportHeight + sab) + 'px');
}
_syncAppHeight();
window.addEventListener('resize', _syncAppHeight);
window.addEventListener('orientationchange', _syncAppHeight);
window.visualViewport?.addEventListener('resize', _syncAppHeight);
window.visualViewport?.addEventListener('scroll', _syncAppHeight);
document.addEventListener('focusin', e => {
  if (!isTextInputTarget(e.target)) return;
  markTextInputFocus();
  document.documentElement.classList.add('keyboard-editing');
}, true);
document.addEventListener('focusout', e => {
  if (!isTextInputTarget(e.target)) return;
  markTextInputFocus();
  setTimeout(() => {
    if (isTextInputActive()) return;
    document.documentElement.classList.remove('keyboard-editing');
    _syncAppHeight();
  }, 260);
}, true);

// ─── Warm / lazy module loading ───────────────────────────────────────────────

// _badgeMod is populated by warmEnhancementModules(); calls before that are no-ops.
let _badgeMod = null;

function warmEnhancementModules() {
  const run = typeof window.requestIdleCallback !== 'undefined'
    ? cb => window.requestIdleCallback(cb, { timeout: 2000 })
    : cb => setTimeout(cb, 500);
  run(_doWarmImports);
}

async function _doWarmImports() {
  const [badgeResult] = await Promise.allSettled([
    import('./platform/badge.js'),
    import('./pages/leaderboard.js'), // pre-warm so leaderboard navigation is instant
    import('./tour.js'),              // pre-warm for new-user onboarding path
  ]);
  if (badgeResult.status === 'fulfilled') {
    _badgeMod = badgeResult.value;
    _updateBadge(); // apply badge count now that the module is ready
  }
}

function _updateBadge() {
  if (!_badgeMod) return;
  const todayStr = eToday();
  const count = state.sessions.filter(s => s.date === todayStr && s.result !== 'invalid').length;
  _badgeMod.setBadge(count).catch(() => {});
}
// sessionFlow calls this after every commit/delete (no-op until badge module loads)
setBadgeUpdater(_updateBadge);

// Tap header to scroll main content to top (mirrors iOS status-bar tap behavior)
document.getElementById('header')?.addEventListener('click', e => {
  if (e.target.closest('button, a, label, input, select')) return;
  document.getElementById('content')?.scrollTo({ top: 0, behavior: 'smooth' });
});

async function init() {
  migrateV1toV2(today());
  migrateDefaultFlags();         // tag pre-existing default tasks with isDefault:true
  document.documentElement.setAttribute('data-theme', storage.getTheme());
  document.documentElement.setAttribute('data-ui-skin', storage.getUiSkin());
  applyRandomThemeForToday(); // overrides saved theme if random-theme feature is on
  initLiquidGlassReflection();
  applyTimeBand();
  renderBg(storage.getBgImage());

  // Listen for future auth changes (sign-ins, sign-outs)
  onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      window._showResetPasswordModal();
    } else if (event === 'SIGNED_IN' && session && !_currentSession) {
      await loadAndStart(session);
    } else if (event === 'SIGNED_OUT') {
      handleSignOut();
    }
  });

  // If we have cached user data, show app immediately — don't wait for Supabase
  const cachedUser = storage.getUser();
  if (cachedUser) {
    state.user      = cachedUser;
    state.tasks     = storage.getTasks();
    state.sessions  = storage.getSessions();
    state.energy    = storage.getEnergy();
    state.dailyPlan = storage.getDailyPlan();
    hideLoading();
    processYesterdayStreak();
    if (state.energy.lastResetDate !== eToday()) {
      showMainApp(); showDailyReport(() => showMorningModal());
    } else {
      showMainApp();
    }
    _updateBadge();
    checkWeeklyBonus();

    // Sync from Supabase in background (no spinner)
    getSession().then(session => {
      if (session) {
        _currentSession = session;
        showSyncBanner('syncing');
        db.loadFromRemote(session.user.id).then(() => {
          // Quietly refresh state from updated cache
          state.user     = storage.getUser()     || state.user;
          state.tasks    = storage.getTasks();
          state.sessions = storage.getSessions();
          state.energy   = storage.getEnergy();
          updateHeader();
          renderPage(currentHash());
          _updateBadge();
          showSyncBanner('synced');
        }).catch(() => {
          showSyncBanner('synced'); // hide banner even on failure
        });
      }
    }).catch(() => {});
    return;
  }

  // No cache: wait for Supabase session (first launch or after sign-out)
  const session = await getSession();
  if (session) {
    await loadAndStart(session);
  } else {
    showLoginScreen();
  }
}

init();
