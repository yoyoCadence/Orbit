/**
 * @vitest-environment jsdom
 */
/**
 * authFlow.test.js — BUG-110：成功登入／註冊後登出，回到登入畫面時表單必須可用。
 *
 * 成功送出後按鈕會停在 disabled（「登入中…」／「註冊中…」），由 onAuthStateChange
 * 接手啟動 App。登出再呼叫 showLoginScreen() 時，舊版因為 listener 已註冊而直接
 * 返回，按鈕維持 disabled，直到重新載入頁面。
 *
 * 只 mock auth.js 與 feedback.js；不碰 Supabase Auth。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('../../pwa/js/auth.js', () => authMock);
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn() }));

const { showLoginScreen } = await import('../../pwa/js/authFlow.js');

document.body.innerHTML = `
  <div id="loading-screen"></div>
  <div id="setup-screen"></div>
  <div id="main-app"></div>
  <div id="login-screen" class="hidden">
    <button id="tab-signin" class="active"></button>
    <button id="tab-signup"></button>
    <form id="auth-form">
      <input id="auth-email" type="email">
      <input id="auth-password" type="password">
      <div id="auth-error" class="hidden"></div>
      <div id="forgot-pw-row"></div>
      <button type="submit" id="auth-submit">登入</button>
    </form>
  </div>`;

const submitBtn = () => document.getElementById('auth-submit');

async function submit(email = 'user@example.com', password = 'secret123') {
  document.getElementById('auth-email').value = email;
  document.getElementById('auth-password').value = password;
  document.getElementById('auth-form')
    .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  // Let the awaited signIn/signUp promises settle.
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  authMock.signIn.mockReset().mockResolvedValue({ data: {}, error: null });
  authMock.signUp.mockReset().mockResolvedValue({ data: {}, error: null });
  window.switchAuthTab?.('signin');
});

describe('BUG-110：登出後回到登入畫面', () => {
  it('成功登入後按鈕停在「登入中…」，登出回到登入畫面即恢復可用', async () => {
    showLoginScreen();
    await submit();
    expect(submitBtn().disabled).toBe(true);
    expect(submitBtn().textContent).toBe('登入中…');

    showLoginScreen();   // sign-out path
    expect(submitBtn().disabled).toBe(false);
    expect(submitBtn().textContent).toBe('登入');
  });

  it('註冊成功（自動登入）後登出，切回登入 tab 可以立即再次登入', async () => {
    showLoginScreen();
    window.switchAuthTab('signup');
    await submit();
    expect(authMock.signUp).toHaveBeenCalledTimes(1);
    expect(submitBtn().disabled).toBe(true);
    expect(submitBtn().textContent).toBe('註冊中…');

    showLoginScreen();
    expect(submitBtn().disabled).toBe(false);
    expect(submitBtn().textContent).toBe('註冊');

    window.switchAuthTab('signin');
    expect(submitBtn().textContent).toBe('登入');
    await submit();
    expect(authMock.signIn).toHaveBeenLastCalledWith('user@example.com', 'secret123');
  });

  it('重複呼叫 showLoginScreen 不會重複註冊 submit listener', async () => {
    showLoginScreen();
    showLoginScreen();
    await submit();
    expect(authMock.signIn).toHaveBeenCalledTimes(1);
  });

  it('登入失敗時按鈕照舊恢復，並顯示錯誤', async () => {
    authMock.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    showLoginScreen();
    await submit();
    expect(submitBtn().disabled).toBe(false);
    expect(submitBtn().textContent).toBe('登入');
    expect(document.getElementById('auth-error').classList.contains('hidden')).toBe(false);
  });
});
