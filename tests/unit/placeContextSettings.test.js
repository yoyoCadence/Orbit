/**
 * @vitest-environment jsdom
 */
/**
 * placeContextSettings.test.js — HW-107：設定頁的位置情境卡片（opt-in、只存本機）。
 * 以真實 storage／placeContext 渲染設定頁；只 mock supabase 與副作用模組。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => {
      const self = {
        select: () => self, eq: () => Promise.resolve({ error: null }),
        update: () => self, insert: () => self, upsert: () => self, delete: () => self,
        in: () => self, order: () => self,
        single: () => Promise.resolve({ data: null, error: null }),
      };
      return self;
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({}),
    },
  },
}));
vi.mock('../../pwa/js/theme.js', () => ({
  applyTheme: vi.fn(),
  applyUiSkin: vi.fn(),
  applyRandomThemeForToday: vi.fn(),
  renderBg: vi.fn(),
  initLiquidGlassReflection: vi.fn(),
}));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ toast: vi.fn(), confirmModal: vi.fn() }));

import { state } from '../../pwa/js/state.js';
import { loadPlaceContext } from '../../pwa/js/platform/placeContext.js';
import { renderSettings } from '../../pwa/js/pages/settings.js';

const OWNER = 'owner-1';
let container;
let getCurrentPosition;

function render() {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  renderSettings(container);
}

const flush = () => new Promise(resolve => { setTimeout(resolve, 0); });

beforeEach(() => {
  localStorage.clear();
  const user = { id: OWNER, name: 'Tester', totalXP: 0, newDayHour: 5 };
  localStorage.setItem('yoyo_user', JSON.stringify(user));
  state.user = user;
  state.tasks = [];
  state.sessions = [];
  window.showToast = vi.fn();
  getCurrentPosition = vi.fn(resolve => resolve({ coords: { latitude: 25.03312, longitude: 121.56498 } }));
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
});

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});

describe('HW-107 設定頁位置情境', () => {
  it('預設關閉；未啟用前不能設定位置，也不讀取定位', () => {
    render();
    expect(container.querySelector('#place-context-toggle').checked).toBe(false);
    container.querySelectorAll('[data-place-set]').forEach(btn => expect(btn.disabled).toBe(true));
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('啟用後可把目前位置設為「家」，只保存粗略座標', async () => {
    render();
    const toggle = container.querySelector('#place-context-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(loadPlaceContext(OWNER).enabled).toBe(true);

    container.querySelector('[data-place-set="home"]').click();
    await flush();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(loadPlaceContext(OWNER).places.home).toEqual({ lat: 25.033, lng: 121.565 });
    expect(container.textContent).toContain('已設定');
  });

  it('定位失敗時提示且不保存', async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail(new Error('denied')));
    render();
    const toggle = container.querySelector('#place-context-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    container.querySelector('[data-place-set="work"]').click();
    await flush();

    expect(window.showToast).toHaveBeenCalledWith('無法取得位置，請確認已允許定位');
    expect(loadPlaceContext(OWNER).places.work).toBeUndefined();
  });

  it('清除位置資料會移除設定並回到關閉', async () => {
    render();
    const toggle = container.querySelector('#place-context-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    container.querySelector('[data-place-set="home"]').click();
    await flush();

    container.querySelector('#place-context-clear').click();
    expect(loadPlaceContext(OWNER)).toEqual({ enabled: false, places: {} });
    expect(container.querySelector('#place-context-toggle').checked).toBe(false);
  });

  it('不支援定位時顯示說明、沒有控制項', () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    render();
    expect(container.querySelector('#place-context-toggle')).toBeNull();
    expect(container.textContent).toContain('這台裝置不支援定位');
  });
});

describe('HW-107 非同步定位期間離開設定頁', () => {
  it('定位完成時若容器已換成其他頁面，不重新繪製設定頁', async () => {
    let grant;
    getCurrentPosition.mockImplementation(resolve => { grant = resolve; });
    render();
    const toggle = container.querySelector('#place-context-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    container.querySelector('[data-place-set="home"]').click();

    container.innerHTML = '<div id="home-page">home</div>';   // router rendered another page
    grant({ coords: { latitude: 25.033, longitude: 121.565 } });
    await flush();

    expect(container.innerHTML).toBe('<div id="home-page">home</div>');
    expect(loadPlaceContext(OWNER).places.home).toEqual({ lat: 25.033, lng: 121.565 });
  });

  it('定位期間按「清除位置資料」，晚到的位置不會被寫回', async () => {
    let grant;
    getCurrentPosition.mockImplementation(resolve => { grant = resolve; });
    render();
    const toggle = container.querySelector('#place-context-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    container.querySelector('[data-place-set="home"]').click();

    container.querySelector('#place-context-clear').click();
    grant({ coords: { latitude: 25.033, longitude: 121.565 } });
    await flush();

    expect(loadPlaceContext(OWNER)).toEqual({ enabled: false, places: {} });
    expect(window.showToast).not.toHaveBeenCalledWith('已把目前位置設為「家」');
  });

  it('定位期間關閉位置情境，晚到的位置不會被寫入', async () => {
    let grant;
    getCurrentPosition.mockImplementation(resolve => { grant = resolve; });
    render();
    const toggle = container.querySelector('#place-context-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    container.querySelector('[data-place-set="work"]').click();

    const offToggle = container.querySelector('#place-context-toggle');
    offToggle.checked = false;
    offToggle.dispatchEvent(new Event('change'));
    grant({ coords: { latitude: 25.033, longitude: 121.565 } });
    await flush();

    expect(loadPlaceContext(OWNER).places.work).toBeUndefined();
  });
});
