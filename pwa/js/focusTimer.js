// Focus timer state machine: duration picker, countdown/count-up tick, desk
// mode (device-orientation), chime, pause compensation, PiP minimize, skip
// flow, early-end confirm, and result picker. Moved verbatim from app.js.
// Settlement is delegated to sessionFlow.submitFocusResult.

import { state } from './state.js';
import { storage } from './storage.js';
import { getMinEffectiveMinutes } from './engine.js';
import { submitFocusResult } from './sessionFlow.js';
import { showToast } from './ui/feedback.js';
import { haptic } from './platform/haptics.js';

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
