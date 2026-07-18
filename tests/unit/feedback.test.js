/**
 * feedback.test.js — ui/feedback.js 提示元件
 * 環境：jsdom
 *
 * 重點迴歸防護：window.showToast 必須被綁定（settings.js / export.js 共 13 處
 * 以全域呼叫；曾因未綁定導致同步按鈕卡在「同步中…」）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { showSyncBanner, showToast, showXPFloat } from '../../pwa/js/ui/feedback.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('showToast', () => {
  it('binds window.showToast to the same function (regression: 13 global call sites)', () => {
    expect(window.showToast).toBe(showToast);
  });

  it('appends a .toast element with the given text', () => {
    showToast('測試訊息');
    const el = document.querySelector('.toast');
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('測試訊息');
  });

  it('works when invoked through the window global', () => {
    window.showToast('經全域呼叫');
    expect(document.querySelector('.toast').textContent).toBe('經全域呼叫');
  });
});

describe('showXPFloat', () => {
  it('appends an .xp-float element with the given text', () => {
    showXPFloat('+60 XP');
    const el = document.querySelector('.xp-float');
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('+60 XP');
  });
});

describe('showSyncBanner', () => {
  it('keeps a visible retry state when remote refresh fails', () => {
    document.body.innerHTML = '<div id="sync-banner" class="hidden"></div>';

    showSyncBanner('error');

    const banner = document.getElementById('sync-banner');
    expect(banner.className).toBe('sync-error');
    expect(banner.textContent).toContain('下次連線重試');
  });
});
