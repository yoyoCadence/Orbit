/**
 * @vitest-environment jsdom
 *
 * headerAvatar.test.js — 頁首的頭像（AUDIT-001）
 *
 * `user.avatar` 是 data URL 或 Supabase 的網址，使用者可以改寫自己的
 * `profiles.avatar_url`。網址裡的 `"` 不能跳出 `src`，變成另一個屬性。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { state } from '../../pwa/js/state.js';
import { updateHeader } from '../../pwa/js/ui/header.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="hdr-avatar"></div><span id="hdr-user-name"></span><span id="hdr-level"></span>
    <span id="hdr-title"></span><button id="hdr-breathing-info-btn"></button>
    <div id="hdr-xp-fill"></div><span id="hdr-xp-text"></span>
    <div id="hdr-energy-fill"></div><span id="hdr-energy-text"></span>`;
  state.sessions = [];
  state.tasks = [];
  state.energy = { currentEnergy: 80, maxEnergy: 100 };
});

describe('updateHeader avatar', () => {
  it('keeps a stored avatar URL inside the img src', () => {
    const avatar = 'https://example.test/a.png" onerror="window.__xss=1';
    state.user = { name: 'Tester', totalXP: 0, avatar };
    updateHeader();
    const avatarEl = document.getElementById('hdr-avatar');
    expect(avatarEl.querySelector('[onerror]')).toBeNull();
    expect(avatarEl.querySelector('img').getAttribute('src')).toBe(avatar);
  });

  it('shows the first letter of the name without an avatar', () => {
    state.user = { name: 'tester', totalXP: 0, avatar: null };
    updateHeader();
    expect(document.getElementById('hdr-avatar').textContent).toBe('T');
  });
});
