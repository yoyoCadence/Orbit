// @vitest-environment jsdom
/**
 * authApi.test.js — auth.js 對 supabase-js 的包裝（TEST-014）
 * 環境：jsdom
 *
 * 登出（BUG-116）由 bug116SignOut.test.js 以真的 SDK 測；這裡以假的 client
 * 確認其餘的包裝傳給 SDK 的參數與回傳值：註冊、登入、Google 登入與重設密碼的
 * 導回網址（不帶 #）、更新密碼、取得 session、監聽 auth 事件，以及離線登出時
 * SDK 丟出錯誤。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const client = vi.hoisted(() => ({
  auth: {
    storageKey: 'sb-test-auth-token',
    storage: { removeItem: vi.fn() },
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}));
vi.mock('../../pwa/js/supabase.js', () => ({ supabase: client }));

const network = vi.hoisted(() => ({ online: true }));
vi.mock('../../pwa/js/platform/network.js', () => ({
  isOnline: () => network.online,
  onConnectivityChange: () => () => {},
}));

import {
  signUp, signIn, signInWithGoogle, signOut, getSession,
  resetPasswordForEmail, updatePassword, onAuthStateChange,
} from '../../pwa/js/auth.js';

const failure = new Error('Invalid login credentials');

beforeEach(() => {
  for (const fn of Object.values(client.auth)) if (typeof fn === 'function') fn.mockReset();
  client.auth.storage.removeItem.mockReset();
  network.online = true;
  window.history.replaceState(null, '', '/app/?v=2#settings');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('註冊與登入', () => {
  it('signUp 傳 email 與密碼，回傳 SDK 的 data 與 error', async () => {
    const data = { user: { id: 'u1' }, session: null };
    client.auth.signUp.mockResolvedValue({ data, error: null });
    await expect(signUp('a@example.com', 'secret12')).resolves.toEqual({ data, error: null });
    expect(client.auth.signUp).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret12' });
  });

  it('signIn 用 signInWithPassword；錯誤照樣回傳', async () => {
    client.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: failure });
    await expect(signIn('a@example.com', 'wrong')).resolves.toEqual({ data: { session: null }, error: failure });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'wrong' });
  });

  it('Google 登入導回目前的網址，但不帶 #（頁面）', async () => {
    client.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await expect(signInWithGoogle()).resolves.toBeNull();
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:3000/app/?v=2' },
    });
  });

  it('Google 登入失敗時回傳錯誤', async () => {
    client.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: failure });
    await expect(signInWithGoogle()).resolves.toBe(failure);
  });
});

describe('密碼', () => {
  it('重設密碼的信導回目前的網址（不帶 #）；成功時回傳 null', async () => {
    client.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await expect(resetPasswordForEmail('a@example.com')).resolves.toBeNull();
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com', {
      redirectTo: 'http://localhost:3000/app/?v=2',
    });
  });

  it('重設密碼失敗時回傳錯誤', async () => {
    client.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: failure });
    await expect(resetPasswordForEmail('a@example.com')).resolves.toBe(failure);
  });

  it('updatePassword 以 updateUser 改密碼；回傳錯誤或 null', async () => {
    client.auth.updateUser.mockResolvedValueOnce({ data: {}, error: null });
    await expect(updatePassword('newpass12')).resolves.toBeNull();
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass12' });

    client.auth.updateUser.mockResolvedValueOnce({ data: {}, error: failure });
    await expect(updatePassword('x')).resolves.toBe(failure);
  });
});

describe('session 與事件', () => {
  it('getSession 回傳 SDK 的 session（沒有時是 null）', async () => {
    const session = { user: { id: 'u1' } };
    client.auth.getSession.mockResolvedValueOnce({ data: { session } });
    await expect(getSession()).resolves.toBe(session);
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(getSession()).resolves.toBeNull();
  });

  it('onAuthStateChange 註冊 callback，回傳可取消的 subscription', () => {
    const subscription = { unsubscribe: vi.fn() };
    client.auth.onAuthStateChange.mockReturnValue({ data: { subscription } });
    const callback = vi.fn();
    expect(onAuthStateChange(callback)).toBe(subscription);
    expect(client.auth.onAuthStateChange).toHaveBeenCalledWith(callback);
  });
});

describe('登出時 SDK 出錯（BUG-116 的補充）', () => {
  it('離線：先刪掉這台裝置的 session，再以 local 登出；SDK 丟出錯誤時回傳它', async () => {
    network.online = false;
    client.auth.signOut.mockRejectedValue(failure);
    await expect(signOut()).resolves.toBe(failure);
    expect(client.auth.storage.removeItem).toHaveBeenCalledWith('sb-test-auth-token');
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('離線：刪除 session 失敗（已經不在）也照樣以 local 登出', async () => {
    network.online = false;
    client.auth.storage.removeItem.mockRejectedValue(new Error('gone'));
    client.auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).resolves.toBeNull();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('線上：SDK 的登出丟出錯誤時，仍刪掉這台裝置的 session，回傳那個錯誤', async () => {
    client.auth.signOut
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ error: null });
    await expect(signOut()).resolves.toBe(failure);
    expect(client.auth.signOut).toHaveBeenNthCalledWith(1);
    expect(client.auth.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(client.auth.storage.removeItem).toHaveBeenCalledWith('sb-test-auth-token');
  });

  it('線上：登出成功時不再刪一次', async () => {
    client.auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).resolves.toBeNull();
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(client.auth.storage.removeItem).not.toHaveBeenCalled();
  });
});
