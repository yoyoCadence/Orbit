import { state }                                              from './state.js';
import { storage, db, migrateV1toV2, migrateDefaultFlags }    from './storage.js';
import { signIn, signUp, signInWithGoogle, signOut as authSignOut, getSession, onAuthStateChange, resetPasswordForEmail, updatePassword } from './auth.js';
import { updateHeader } from './ui/header.js';

// Re-export so existing importers (profile.js via dynamic import, tests) keep working.
export { updateHeader };
import { setBadgeUpdater } from './sessionFlow.js';
import './focusTimer.js'; // binds window.startFocus / endFocus / skipFocus / …
import { uid, today } from './utils.js';
import {
  eToday, processYesterdayStreak, showStreakUnlockModal,
  showDailyReport, showMorningModal, checkWeeklyBonus, startDayWatcher,
} from './dayCycle.js';
import { createDefaultTasks }   from './defaultTasks.js';
import { renderPage, currentHash, isTextInputTarget, isTextInputActive, markTextInputFocus } from './router.js';
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
