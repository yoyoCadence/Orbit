/**
 * bootSequenceGuard.test.js — 單次啟動只跑一次 boot 序列（BUG-106）
 * 環境：node
 *
 * 這個 gate 的存在理由是 app.js 有兩條各自獨立的 boot 入口（快取分支與
 * `SIGNED_IN` → `loadAndStart()`），在 token refresh／慢網路／PWA 由背景恢復時
 * 會在同一次啟動內都執行。這裡鎖住「重複要 claim 會被擋下，但合法的重跑不會」。
 */

import { describe, it, expect } from 'vitest';
import { createBootSequenceGuard } from '../../pwa/js/platform/bootSequenceGuard.js';

describe('createBootSequenceGuard', () => {
  it('只讓同一次啟動的第一個呼叫者跑 boot 序列', () => {
    const guard = createBootSequenceGuard();

    expect(guard.claim('owner-a')).toBe(true);
    expect(guard.claim('owner-a')).toBe(false);
    expect(guard.claim('owner-a')).toBe(false);
  });

  it('切換到另一個帳號時重新 claim', () => {
    const guard = createBootSequenceGuard();
    guard.claim('owner-a');

    expect(guard.claim('owner-b')).toBe(true);
    expect(guard.getOwnerId()).toBe('owner-b');
    expect(guard.claim('owner-b')).toBe(false);
  });

  it('登出後重新登入同一個帳號仍會重跑 boot 序列', () => {
    const guard = createBootSequenceGuard();
    guard.claim('owner-a');

    guard.reset();

    expect(guard.hasBooted()).toBe(false);
    expect(guard.getOwnerId()).toBeNull();
    expect(guard.claim('owner-a')).toBe(true);
  });

  it('把訪客（無 owner id）視為一個獨立身分', () => {
    const guard = createBootSequenceGuard();

    expect(guard.claim()).toBe(true);
    expect(guard.claim(null)).toBe(false);
    expect(guard.claim(undefined)).toBe(false);
    expect(guard.getOwnerId()).toBeNull();
    expect(guard.hasBooted()).toBe(true);
    // 訪客先開，之後登入 → 是不同身分，要重跑
    expect(guard.claim('owner-a')).toBe(true);
  });
});
