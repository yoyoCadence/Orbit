/**
 * @vitest-environment jsdom
 *
 * routerNavigation.test.js — TEST-005: what routerLifecycle.test.js does not
 * reach in pwa/js/router.js: the bottom bar's active page and the slide
 * direction, the loading skeleton and the fallback when a lazy page cannot
 * load, and swipe navigation between pages (and when a swipe is ignored).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let open;
  const gate = new Promise(resolve => { open = resolve; });
  return {
    renderHome: vi.fn(content => { content.textContent = 'home'; }),
    renderGoals: vi.fn(content => { content.textContent = 'goals'; }),
    renderPersonalSpace: vi.fn(content => { content.textContent = 'space'; }),
    showToast: vi.fn(),
    gate,
    open,
  };
});

vi.mock('../../pwa/js/pages/home.js', () => ({ renderHome: mocks.renderHome }));
vi.mock('../../pwa/js/pages/goals.js', () => ({ renderGoals: mocks.renderGoals }));
vi.mock('../../pwa/js/pages/review.js', () => ({ renderReview: vi.fn() }));
vi.mock('../../pwa/js/pages/profile.js', () => ({ renderProfile: vi.fn() }));
vi.mock('../../pwa/js/pages/settings.js', () => ({ renderSettings: vi.fn() }));
vi.mock('../../pwa/js/pages/personalSpace.js', async () => {
  await mocks.gate;
  return { renderPersonalSpace: mocks.renderPersonalSpace };
});
// Offline and never loaded: the module cannot be imported.
vi.mock('../../pwa/js/pages/leaderboard.js', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: mocks.showToast }));

const { markTextInputFocus, renderPage, teardownActivePageRenderer } = await import('../../pwa/js/router.js');

const content = () => document.getElementById('content');

beforeEach(() => {
  teardownActivePageRenderer();
  vi.clearAllMocks();
  document.body.innerHTML = `
    <main id="content"></main>
    <nav>
      <button class="nav-item" data-page="home"></button>
      <button class="nav-item" data-page="goals"></button>
      <button class="nav-item" data-page="review"></button>
    </nav>
    <input id="text">`;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('page change', () => {
  // The first render (no slide) is in routerFirstRender.test.js: the router
  // remembers the last page across tests, so here it starts from a known one
  // (a page outside the order counts as home) whatever ran before (TEST-016).
  it('marks the page in the bottom bar and slides toward it', async () => {
    const active = () => [...document.querySelectorAll('.nav-item.active')].map(item => item.dataset.page);
    await renderPage('somewhere');
    content().dispatchEvent(new Event('animationend'));
    await renderPage('goals');
    expect(active()).toEqual(['goals']);
    expect(content().classList.contains('page-slide-left')).toBe(true);
    content().dispatchEvent(new Event('animationend'));
    await renderPage('review');
    expect(active()).toEqual(['review']);
    expect(content().classList.contains('page-slide-left')).toBe(true);
    content().dispatchEvent(new Event('animationend'));
    expect(content().className).toBe('');
    await renderPage('home');
    expect(active()).toEqual(['home']);
    expect(content().classList.contains('page-slide-right')).toBe(true);
    expect(content().dataset.route).toBe('home');
    content().dispatchEvent(new Event('animationend'));
    // The same page again: no slide.
    await renderPage('home');
    expect(content().className).toBe('');
    // A page outside the order counts as the first one for the next slide.
    await renderPage('somewhere');
    content().dispatchEvent(new Event('animationend'));
    await renderPage('goals');
    expect(content().classList.contains('page-slide-left')).toBe(true);
  });

  it('a page change before the slide has ended replaces it (TEST-017)', async () => {
    await renderPage('somewhere');
    content().dispatchEvent(new Event('animationend'));
    await renderPage('review');
    expect(content().classList.contains('page-slide-left')).toBe(true);
    // No animationend yet: the next page slides the other way, alone.
    await renderPage('goals');
    expect([...content().classList]).toEqual(['page-slide-right']);
  });

  it('shows the home page with a message when a page cannot load', async () => {
    vi.useFakeTimers();
    await renderPage('leaderboard');
    expect(mocks.showToast).toHaveBeenCalledWith('頁面載入失敗，請稍後再試');
    expect(mocks.renderHome).toHaveBeenCalledWith(content());
    expect(content().textContent).toBe('home');
    // The placeholder's timer was cleared: it does not cover the home page later.
    await vi.advanceTimersByTimeAsync(300);
    expect(content().textContent).toBe('home');
  });

  it('shows a loading placeholder only when a page takes more than 200 ms to load', async () => {
    vi.useFakeTimers();
    const rendering = renderPage('personalSpace');
    await vi.advanceTimersByTimeAsync(199);
    expect(content().querySelector('.lazy-page-loading')).toBe(null);
    await vi.advanceTimersByTimeAsync(1);
    expect(content().querySelector('.lazy-page-loading')).not.toBe(null);
    mocks.open();
    vi.useRealTimers();
    await rendering;
    expect(mocks.renderPersonalSpace).toHaveBeenCalledWith(content());
    expect(content().textContent).toBe('space');
    // Loaded again (now cached) within 200 ms: no placeholder over it later.
    vi.useFakeTimers();
    await renderPage('personalSpace');
    await vi.advanceTimersByTimeAsync(300);
    expect(content().textContent).toBe('space');
  });
});

describe('swipe navigation', () => {
  let navigate;
  // The router remembers when a text field last had focus: each test starts
  // well after the previous one.
  let clock = 1_000_000;

  beforeEach(() => {
    navigate = vi.fn();
    window.navigate = navigate;
    window._isDragging = false;
    window.history.replaceState(null, '', '#goals');
    clock += 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    window.history.replaceState(null, '', '#');
    delete window._isDragging;
  });

  function touch(type, x, y, target = document.body) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', {
      value: [{ clientX: x, clientY: y }],
    });
    target.dispatchEvent(event);
  }

  // Starts near the top: a swipe in a text field resets the start to (0, 0),
  // which must still read as horizontal, so only the guards stop it.
  function swipe(dx, dy = 0, target = document.body) {
    touch('touchstart', 300, 20, target);
    touch('touchend', 300 + dx, 20 + dy, target);
  }

  it('goes to the next page on a swipe left and the previous one on a swipe right', () => {
    swipe(-100);
    expect(navigate).toHaveBeenLastCalledWith('review');
    swipe(100);
    expect(navigate).toHaveBeenLastCalledWith('home');
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('stops at the first and the last page, and on a page outside the order', () => {
    window.history.replaceState(null, '', '#home');
    swipe(100);
    window.history.replaceState(null, '', '#settings');
    swipe(-100);
    window.history.replaceState(null, '', '#somewhere');
    swipe(-100);
    expect(navigate).not.toHaveBeenCalled();
    // No hash is the home page.
    window.history.replaceState(null, '', '#');
    swipe(-100);
    expect(navigate).toHaveBeenCalledWith('goals');
  });

  it('ignores short moves and scrolling', () => {
    swipe(-59);
    // Mostly vertical: |dy| > 0.75 |dx|.
    swipe(-100, 76);
    expect(navigate).not.toHaveBeenCalled();
    swipe(-100, 75);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('ignores swipes in text fields, while typing, and just after typing', () => {
    const input = document.getElementById('text');
    swipe(-100, 0, input);
    input.focus();
    swipe(-100);
    input.blur();
    markTextInputFocus();
    clock += 899;
    swipe(-100);
    expect(navigate).not.toHaveBeenCalled();
    clock += 1;
    swipe(-100);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('ignores swipes while something is dragged or a photo is shown full screen', () => {
    window._isDragging = true;
    swipe(-100);
    window._isDragging = false;
    const lightbox = document.createElement('div');
    lightbox.className = 'proof-lightbox';
    document.body.append(lightbox);
    swipe(-100);
    expect(navigate).not.toHaveBeenCalled();
    lightbox.remove();
    swipe(-100);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
