// @vitest-environment jsdom
/**
 * tour.test.js — 新手導覽（TEST-014）
 * 環境：jsdom
 *
 * 逐步走完導覽：聚光燈與提示框的位置、要使用者自己操作的兩步（把教學任務加入
 * 計畫、完成它；以 MutationObserver 偵測，600 ms 後才換下一步）、找不到目標時
 * 略過、跳過與完成都記下「已完成」並移除教學任務；BUG-144：在那 600 ms 內按
 * 「跳過」，導覽不再跳出來。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockState = vi.hoisted(() => ({ tasks: [], dailyPlan: [] }));
vi.mock('../../pwa/js/state.js', () => ({ state: mockState }));

const TUTORIAL = 'tour-task';
let tour;

const tooltip = () => document.querySelector('.tour-tooltip');
const title = () => tooltip()?.querySelector('.tour-title')?.textContent ?? null;
const counter = () => tooltip()?.querySelector('.tour-counter')?.textContent ?? null;
const clickNext = () => tooltip().querySelector('.tour-next').click();
const clickSkip = () => tooltip().querySelector('.tour-skip').click();
const overlays = () => document.querySelectorAll('.tour-backdrop, .tour-spot, .tour-tooltip').length;
const settleObserver = () => Promise.resolve();

function rect({ left = 100, top = 100, width = 200, height = 40 } = {}) {
  return {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
    toJSON() {},
  };
}

function place(element, box) {
  element.getBoundingClientRect = () => rect(box);
  return element;
}

/** The home page as the tour sees it: task cards (the tutorial one once injected) and the plan. */
function renderHome() {
  document.getElementById('content').innerHTML = `
    ${mockState.tasks.map(t => `<div class="task-card" data-task-id="${t.id}"></div>`).join('')}
    <div id="plan-list">
      ${mockState.dailyPlan.map(id => `<div class="plan-card" data-task-id="${id}"></div>`).join('')}
    </div>
  `;
  document.querySelectorAll('.task-card, .plan-card').forEach(card => place(card, { top: 300 }));
}

/** What tapping the tutorial card does: it joins the plan and Home redraws. */
function addPlanCard() {
  mockState.dailyPlan = [...mockState.dailyPlan, TUTORIAL];
  renderHome();
  return document.querySelector(`.plan-card[data-task-id="${TUTORIAL}"]`);
}

/** Completing it from the plan card shows its count badge (on the card drawn now). */
function completePlanCard() {
  const badge = document.createElement('span');
  badge.className = 'plan-count-badge';
  document.querySelector(`#plan-list .plan-card[data-task-id="${TUTORIAL}"]`).appendChild(badge);
}

/** Runs the tour to the review step through both interactive steps. */
async function walkToReview() {
  tour.startTour();
  clickNext();
  addPlanCard();
  await settleObserver();
  vi.advanceTimersByTime(600);
  expect(title()).toBe('完成任務 ✓');
  completePlanCard();
  await settleObserver();
  vi.advanceTimersByTime(600);
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  mockState.tasks = [{ id: 't1', name: 'Task' }];
  mockState.dailyPlan = [];
  // Two frames after navigating: run them at once.
  vi.stubGlobal('requestAnimationFrame', cb => { cb(0); return 0; });
  window.navigate = vi.fn(page => { if (page === 'home') renderHome(); });
  document.body.innerHTML = `
    <header id="header"></header>
    <main id="content"></main>
    <nav id="nav">
      <button data-page="review"></button>
      <button data-page="settings"></button>
    </nav>
  `;
  place(document.getElementById('header'), { top: 0, left: 0, width: 1024, height: 56 });
  place(document.querySelector('#nav [data-page="review"]'), { top: 700, left: 300, width: 60, height: 56 });
  place(document.querySelector('#nav [data-page="settings"]'), { top: 700, left: 900, width: 60, height: 56 });
  tour = await import('../../pwa/js/tour.js');
});

afterEach(() => {
  // Each test imports its own tour.js: one left running would still watch
  // document.body (its MutationObserver) and step in during the next test.
  document.querySelector('.tour-skip')?.click();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.navigate;
  document.body.innerHTML = '';
});

describe('走完導覽', () => {
  it('第一步聚光在 header，提示框在下方，可以按「下一步」', () => {
    tour.startTour();

    expect(title()).toBe('你的成長指標');
    expect(counter()).toBe('1 / 6');
    const spot = document.querySelector('.tour-spot');
    // Clamped to the viewport: 0 − 6 → 0, 1024 + 6 → 1024.
    expect(spot.style.left).toBe('0px');
    expect(spot.style.top).toBe('0px');
    expect(spot.style.width).toBe('1024px');
    expect(spot.style.height).toBe('62px');
    // Below: 56 + 6 + 14.
    expect(tooltip().style.top).toBe('76px');
    expect(tooltip().querySelector('.tour-next').textContent).toBe('下一步 →');
    expect(document.querySelector('.tour-backdrop').style.pointerEvents).toBe('');
    expect(tour.isTourDone()).toBe(false);
  });

  it('加入計畫的那一步：先放入教學任務並回到首頁，不能按「下一步」，點擊能穿過遮罩', () => {
    tour.startTour();
    clickNext();

    expect(mockState.tasks[0]).toMatchObject({ id: TUTORIAL, isTutorial: true });
    expect(window.navigate).toHaveBeenCalledWith('home');
    expect(title()).toBe('加入今日計劃');
    expect(counter()).toBe('2 / 6');
    expect(tooltip().querySelector('.tour-next')).toBeNull();
    expect(document.querySelector('.tour-backdrop').style.pointerEvents).toBe('none');
    expect(overlays()).toBe(3);
  });

  it('教學任務出現在計畫裡時，600 ms 後換到「完成任務」', async () => {
    tour.startTour();
    clickNext();
    addPlanCard();
    await settleObserver();

    vi.advanceTimersByTime(599);
    expect(title()).toBe('加入今日計劃');
    vi.advanceTimersByTime(1);
    expect(title()).toBe('完成任務 ✓');
    expect(counter()).toBe('3 / 6');
  });

  it('完成教學任務後移除它（任務與計畫），再換到週回顧（提示框在上方）', async () => {
    mockState.dailyPlan = ['t1'];
    await walkToReview();
    expect(mockState.tasks.map(t => t.id)).toEqual(['t1']);
    expect(mockState.dailyPlan).toEqual(['t1']);

    expect(window.navigate).toHaveBeenLastCalledWith('review');
    expect(title()).toBe('週回顧');
    // Above: 700 − 6 − 14 − 148.
    expect(tooltip().style.top).toBe('532px');
    // Centered on the button: 330 − 144.
    expect(tooltip().style.left).toBe('186px');
  });

  it('設定之後是置中的最後一步；按「完成 ✓」收起並記下已完成', async () => {
    await walkToReview();
    clickNext();
    expect(window.navigate).toHaveBeenLastCalledWith('settings');
    expect(title()).toBe('設定');
    // Right edge: 1024 − 288 − 12.
    expect(tooltip().style.left).toBe('724px');

    clickNext();
    expect(title()).toBe('準備好了！🚀');
    expect(document.querySelector('.tour-spot')).toBeNull();
    expect(document.querySelector('.tour-backdrop').classList.contains('tour-backdrop-center')).toBe(true);
    expect(tooltip().classList.contains('tour-tooltip-center')).toBe(true);
    expect(tooltip().querySelector('.tour-body').innerHTML).toContain('<br>');
    expect(tooltip().querySelector('.tour-next').textContent).toBe('完成 ✓');

    clickNext();
    expect(overlays()).toBe(0);
    expect(tour.isTourDone()).toBe(true);
    expect(localStorage.getItem('yoyo_tourDone')).toBe('1');
  });
});

describe('略過、跳過與重新開始', () => {
  it('找不到要聚光的元素時略過那一步', () => {
    document.getElementById('header').remove();
    tour.startTour();
    expect(title()).toBe('加入今日計劃');
  });

  it('教學任務的計畫卡已在畫面上時也是 600 ms 後換下一步', () => {
    tour.startTour();
    // Already in the plan when Home draws (restarting removes it from state
    // first, so this is the page drawing it before the step is measured).
    window.navigate.mockImplementation(() => { addPlanCard(); });
    clickNext();
    expect(title()).toBe('加入今日計劃');
    vi.advanceTimersByTime(600);
    expect(title()).toBe('完成任務 ✓');
  });

  it('按「跳過」：收起、移除教學任務並記下已完成', () => {
    mockState.dailyPlan = [TUTORIAL, 't1'];
    tour.startTour();
    clickNext();
    clickSkip();

    expect(overlays()).toBe(0);
    expect(mockState.tasks.map(t => t.id)).toEqual(['t1']);
    expect(mockState.dailyPlan).toEqual(['t1']);
    expect(tour.isTourDone()).toBe(true);
  });

  it('BUG-144：在換下一步的 600 ms 內按「跳過」，導覽不再出現', async () => {
    tour.startTour();
    clickNext();
    addPlanCard();
    await settleObserver();
    expect(title()).toBe('加入今日計劃');

    clickSkip();
    vi.advanceTimersByTime(600);
    expect(overlays()).toBe(0);
    expect(window.navigate).toHaveBeenCalledTimes(1);

    // Nor after the last interactive step, where the task is removed first.
    localStorage.clear();
    tour.startTour();
    clickNext();
    addPlanCard();
    await settleObserver();
    vi.advanceTimersByTime(600);
    expect(title()).toBe('完成任務 ✓');
    completePlanCard();
    await settleObserver();
    clickSkip();
    vi.advanceTimersByTime(600);
    expect(overlays()).toBe(0);
    expect(window.navigate).not.toHaveBeenCalledWith('review');
  });

  it('跳過之後，畫面再變也不會換步（不再監看）', async () => {
    tour.startTour();
    clickNext();
    clickSkip();
    addPlanCard();
    await settleObserver();
    vi.advanceTimersByTime(600);
    expect(overlays()).toBe(0);
  });

  it('重新開始時先移除上一次留下的教學任務，從第一步開始', () => {
    mockState.tasks = [{ id: TUTORIAL }, { id: 't1' }];
    mockState.dailyPlan = [TUTORIAL];
    tour.startTour();
    expect(mockState.tasks.map(t => t.id)).toEqual(['t1']);
    expect(mockState.dailyPlan).toEqual([]);
    expect(title()).toBe('你的成長指標');
    expect(overlays()).toBe(3);

    tour.startTour();
    expect(overlays()).toBe(3);
  });
});

describe('提示框的位置', () => {
  it('下方放不下時改放上方', () => {
    place(document.getElementById('header'), { top: 650, left: 400, width: 100, height: 40 });
    tour.startTour();
    // Below would be 690 + 20 = 710 > 768 − 148 − 12; above: 650 − 20 − 148.
    expect(tooltip().style.top).toBe('482px');
  });

  it('上方放不下時改放下方；靠左時不超出左邊界', async () => {
    place(document.querySelector('#nav [data-page="review"]'), { top: 40, left: 0, width: 40, height: 40 });
    await walkToReview();
    // Above would be 40 − 168 < 12; below: 80 + 20.
    expect(tooltip().style.top).toBe('100px');
    expect(tooltip().style.left).toBe('12px');
  });

  it('下方放不下、上方又超出時夾在上邊界', () => {
    vi.stubGlobal('innerHeight', 200);
    place(document.getElementById('header'), { top: 40, left: 400, width: 100, height: 100 });
    tour.startTour();
    // Below 160 overflows, above 40 − 168 is negative: clamped to 12.
    expect(tooltip().style.top).toBe('12px');
  });

  it('上方放不下、下方又超出時夾在下邊界', async () => {
    vi.stubGlobal('innerHeight', 200);
    place(document.querySelector('#nav [data-page="review"]'), { top: 40, left: 400, width: 100, height: 100 });
    await walkToReview();
    // Above is negative, below 160 overflows: clamped to 200 − 148 − 12.
    expect(tooltip().style.top).toBe('40px');
  });
});
