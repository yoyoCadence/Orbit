/**
 * @vitest-environment jsdom
 *
 * authFlowForms.test.js — TEST-004: the login screen's other paths
 * (pwa/js/authFlow.js), next to authFlow.test.js (BUG-110): the sign-in and
 * sign-up messages, the password eye, Google sign-in, and the forgot-password
 * and set-new-password dialogs. auth.js and feedback.js are mocked; nothing
 * reaches Supabase Auth.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updatePassword: vi.fn(),
}));
const feedback = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../pwa/js/auth.js', () => authMock);
vi.mock('../../pwa/js/ui/feedback.js', () => feedback);

const { hideLoading, showLoginScreen } = await import('../../pwa/js/authFlow.js');

const LOGIN = `
  <div id="loading-screen"></div>
  <div id="setup-screen"></div>
  <div id="main-app"></div>
  <div id="login-screen" class="hidden">
    <button id="tab-signin" class="active"></button>
    <button id="tab-signup"></button>
    <form id="auth-form">
      <input id="auth-email" type="email">
      <input id="auth-password" type="password" autocomplete="current-password">
      <span id="pw-eye-show"></span><span id="pw-eye-hide" style="display:none"></span>
      <div id="auth-error" class="hidden"></div>
      <div id="forgot-pw-row"></div>
      <button type="submit" id="auth-submit">登入</button>
    </form>
  </div>`;
document.body.innerHTML = LOGIN;

const $ = id => document.getElementById(id);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

async function submit(email = ' user@example.com ', password = 'secret123') {
  $('auth-email').value = email;
  $('auth-password').value = password;
  $('auth-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.signIn.mockResolvedValue({ data: {}, error: null });
  authMock.signUp.mockResolvedValue({ data: {}, error: null });
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.remove());
  window.switchAuthTab('signin');
  showLoginScreen();
});

describe('login screen', () => {
  it('shows the login screen over the others and hides the loading screen', () => {
    $('main-app').classList.remove('hidden');
    hideLoading();
    showLoginScreen();
    expect($('loading-screen').classList.contains('hidden')).toBe(true);
    expect($('main-app').classList.contains('hidden')).toBe(true);
    expect($('setup-screen').classList.contains('hidden')).toBe(true);
    expect($('login-screen').classList.contains('hidden')).toBe(false);
  });

  it('switches between sign-in and sign-up: button text, password autocomplete, forgot-password row', () => {
    $('auth-error').classList.remove('hidden');
    window.switchAuthTab('signup');
    expect($('tab-signup').classList.contains('active')).toBe(true);
    expect($('tab-signin').classList.contains('active')).toBe(false);
    expect($('auth-submit').textContent).toBe('註冊');
    expect($('auth-password').autocomplete).toBe('new-password');
    expect($('forgot-pw-row').style.display).toBe('none');
    expect($('auth-error').classList.contains('hidden')).toBe(true);
    window.switchAuthTab('signin');
    expect($('auth-submit').textContent).toBe('登入');
    expect($('auth-password').autocomplete).toBe('current-password');
    expect($('forgot-pw-row').style.display).toBe('');
  });

  it('shows and hides the password', () => {
    window.togglePasswordVisibility();
    expect($('auth-password').type).toBe('text');
    expect($('pw-eye-show').style.display).toBe('none');
    expect($('pw-eye-hide').style.display).toBe('');
    window.togglePasswordVisibility();
    expect($('auth-password').type).toBe('password');
    expect($('pw-eye-show').style.display).toBe('');
    expect($('pw-eye-hide').style.display).toBe('none');
  });

  it('signs in with the trimmed email, and explains a wrong password', async () => {
    authMock.signIn.mockResolvedValue({ error: new Error('Invalid login credentials') });
    await submit();
    expect(authMock.signIn).toHaveBeenCalledWith('user@example.com', 'secret123');
    expect($('auth-error').textContent).toContain('帳號或密碼錯誤');
    expect($('auth-error').textContent).toContain('Google');
    expect($('auth-error').classList.contains('hidden')).toBe(false);
    // Another error is shown as it is.
    authMock.signIn.mockResolvedValue({ error: new Error('Network request failed') });
    await submit();
    expect($('auth-error').textContent).toBe('Network request failed');
    expect($('auth-submit').disabled).toBe(false);
  });

  it('says an email is already registered, or shows the sign-up error as it is', async () => {
    window.switchAuthTab('signup');
    authMock.signUp.mockResolvedValue({ error: new Error('User already registered') });
    await submit();
    expect($('auth-error').textContent).toBe('此 Email 已註冊，請直接登入');
    expect($('auth-submit').textContent).toBe('註冊');
    expect($('auth-submit').disabled).toBe(false);
    authMock.signUp.mockResolvedValue({ error: new Error('Password should be at least 6 characters') });
    await submit();
    expect($('auth-error').textContent).toBe('Password should be at least 6 characters');
    expect(authMock.signIn).not.toHaveBeenCalled();
  });

  it('signs in right after signing up; when that fails, switches to the sign-in tab with its message hidden (BUG-120)', async () => {
    window.switchAuthTab('signup');
    authMock.signIn.mockResolvedValue({ error: new Error('Email not confirmed') });
    await submit();
    expect(authMock.signUp).toHaveBeenCalledWith('user@example.com', 'secret123');
    expect(authMock.signIn).toHaveBeenCalledWith('user@example.com', 'secret123');
    // Today the message is written, then hidden again by the switch to the
    // sign-in tab: the person sees no message at all (BUG-120). With "Confirm
    // email" on (PRO-017RA-Auth) this is every sign-up.
    expect($('auth-error').textContent).toBe('註冊成功！請用剛設定的密碼登入。');
    expect($('auth-error').classList.contains('hidden')).toBe(true);
    expect($('tab-signin').classList.contains('active')).toBe(true);
    expect($('auth-submit').textContent).toBe('登入');
    expect($('auth-submit').disabled).toBe(false);
  });
});

describe('Google sign-in', () => {
  it('shows a toast only when it cannot start', async () => {
    authMock.signInWithGoogle.mockResolvedValue(null);
    await window.loginWithGoogle();
    expect(feedback.showToast).not.toHaveBeenCalled();
    authMock.signInWithGoogle.mockResolvedValue(new Error('popup blocked'));
    await window.loginWithGoogle();
    expect(feedback.showToast).toHaveBeenLastCalledWith('Google 登入失敗：popup blocked');
    authMock.signInWithGoogle.mockResolvedValue({});
    await window.loginWithGoogle();
    expect(feedback.showToast).toHaveBeenLastCalledWith('Google 登入失敗：請稍後再試');
  });
});

describe('forgot password', () => {
  const open = () => {
    window.showForgotPassword();
    return $('forgot-pw-modal');
  };

  it('asks for an email first, then sends the link and says so', async () => {
    const modal = open();
    const button = modal.querySelector('#forgot-pw-submit');
    button.click();
    await settle();
    expect(modal.querySelector('#forgot-pw-msg').textContent).toBe('請輸入 Email');
    expect(authMock.resetPasswordForEmail).not.toHaveBeenCalled();

    authMock.resetPasswordForEmail.mockResolvedValue(null);
    modal.querySelector('#forgot-pw-email').value = '  me@example.com ';
    button.click();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('寄送中…');
    await settle();
    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith('me@example.com');
    expect(modal.querySelector('#forgot-pw-msg').textContent).toContain('已寄出');
    expect(button.textContent).toBe('已寄出');
    expect(button.disabled).toBe(true);
  });

  it('shows why sending failed and lets the person try again', async () => {
    const modal = open();
    const button = modal.querySelector('#forgot-pw-submit');
    modal.querySelector('#forgot-pw-email').value = 'me@example.com';
    authMock.resetPasswordForEmail.mockResolvedValue(new Error('Email rate limit exceeded'));
    button.click();
    await settle();
    expect(modal.querySelector('#forgot-pw-msg').textContent).toBe('Email rate limit exceeded');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('寄送重設信');
    authMock.resetPasswordForEmail.mockResolvedValue({});
    button.click();
    await settle();
    expect(modal.querySelector('#forgot-pw-msg').textContent).toBe('寄送失敗，請稍後再試');
  });

  it('closes with its button or a tap outside the box, not inside it', () => {
    let modal = open();
    modal.querySelector('.modal-box').click();
    expect($('forgot-pw-modal')).not.toBe(null);
    modal.click();
    expect($('forgot-pw-modal')).toBe(null);
    modal = open();
    modal.querySelector('.modal-close-btn').click();
    expect($('forgot-pw-modal')).toBe(null);
  });
});

describe('set a new password (from the reset link)', () => {
  const open = () => {
    $('login-screen').classList.remove('hidden');
    window._showResetPasswordModal();
    return document.querySelector('.modal-overlay');
  };

  it('replaces the login screen, needs six characters, and updates the password', async () => {
    const modal = open();
    expect($('login-screen').classList.contains('hidden')).toBe(true);
    expect($('setup-screen').classList.contains('hidden')).toBe(true);
    const input = modal.querySelector('#reset-pw-input');
    modal.querySelector('#reset-pw-toggle').click();
    expect(input.type).toBe('text');
    modal.querySelector('#reset-pw-toggle').click();
    expect(input.type).toBe('password');

    const button = modal.querySelector('#reset-pw-submit');
    input.value = '12345';
    button.click();
    await settle();
    expect(modal.querySelector('#reset-pw-msg').textContent).toBe('密碼至少需要 6 個字元');
    expect(authMock.updatePassword).not.toHaveBeenCalled();

    authMock.updatePassword.mockResolvedValue(null);
    input.value = '123456';
    button.click();
    expect(button.textContent).toBe('更新中…');
    await settle();
    expect(authMock.updatePassword).toHaveBeenCalledWith('123456');
    expect(modal.isConnected).toBe(false);
    expect(feedback.showToast).toHaveBeenCalledWith('密碼已更新，歡迎回來！');
  });

  it('keeps the dialog with the error when the update fails', async () => {
    const modal = open();
    modal.querySelector('#reset-pw-input').value = 'abcdefg';
    authMock.updatePassword.mockResolvedValue(new Error('New password should be different from the old password.'));
    modal.querySelector('#reset-pw-submit').click();
    await settle();
    expect(modal.isConnected).toBe(true);
    expect(modal.querySelector('#reset-pw-msg').textContent).toBe('New password should be different from the old password.');
    expect(modal.querySelector('#reset-pw-submit').disabled).toBe(false);
    expect(modal.querySelector('#reset-pw-submit').textContent).toBe('更新密碼');
    authMock.updatePassword.mockResolvedValue({});
    modal.querySelector('#reset-pw-submit').click();
    await settle();
    expect(modal.querySelector('#reset-pw-msg').textContent).toBe('更新失敗，請稍後再試');
  });
});
