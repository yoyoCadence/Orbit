// Login screen UI: sign-in/sign-up form, tab switching, Google OAuth button,
// forgot-password and reset-password modals. Moved verbatim from app.js.
// Successful sign-in flows through supabase onAuthStateChange (handled by
// app.js init) — this module never boots the app itself.

import { signIn, signUp, signInWithGoogle, resetPasswordForEmail, updatePassword } from './auth.js';
import { showToast } from './ui/feedback.js';

export function hideLoading() {
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

// ── Login screen ──────────────────────────────────────────────────────────────

// #auth-form 是 index.html 的靜態節點、從不重建——submit 監聽只能綁一次。
// （舊行為在登出時重置此旗標，導致下次進登入頁重複 addEventListener，
// 送出時 signIn/signUp 被呼叫兩次。）
let _loginListenerSet = false;

function _showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

export function showLoginScreen() {
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
