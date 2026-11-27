// @vitest-environment jsdom
/**
 * tour.test.js — 新使用者導覽（TEST-014）
 * 環境：jsdom
 *
 * tour.js 只依賴 state 與 DOM：`window.navigate` 換頁，之後兩個 animation
 * frame 才量畫面；第 2、3 步等使用者在首頁真的把教學任務加入計畫、完成它
 * （MutationObserver 看到計畫卡與次數標記）。這裡以一個極簡的「首頁」依
 * state 畫出任務卡、計畫卡與次數標記，模擬那兩個動作。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let state;
let tour;

const tooltip = () => document.querySelector('.tour-tooltip');
const title = () => tooltip()?.querySelector('.tour-title')?.textContent;
const counter = () => tooltip()?.querySelector('.tour-counter')?.textContent;
const next = () => tooltip().querySelector('.tour-next');
const skip = () => tooltip().querySelector('.tour-skip');

/** A minimal Home: task cards, the plan and today's count per task. */
function renderPage(page) {
  const content = document.getElementById('content');
  if (page !== 'home') {
    content.innerHTML = `<div class="page-${page}"></div>`;
    return;
  }
  const counts = {};
  for (const s of state.sessions) counts[s.taskId] = (counts[s.taskId] || 0) + 1;
  const plan = state.dailyPlan
    .map(id => state.tasks.find(t => t.id === id))
    .filter(Boolean)
    .map(t => `<div class="plan-card" data-task-id="${t.id}">${counts[t.id] ? `<span class="plan-count-badge">${counts[t.id]}</span>` : ''}</div>`)
    .join('');
  content.innerHTML = `
    <div class="plan-list" id="plan-list">${plan}</div>
    ${state.tasks.map(t => `<div class="task-card" data-task-id="${t.id}">${t.name}</div>`).join('')}
  `;
}

/** Two animation frames (each a 16 ms timer here) plus what they start. */
async function frames() {
  await vi.advanceTimersByTimeAsync(40);
}

/** The tour waits 600 ms after an interactive step before the next one. */
async function afterInteractiveStep() {
  await vi.advanceTimersByTimeAsync(600);
  await frames();
}

function addTutorialToPlan() {
  state.dailyPlan.push('tour-task');
  renderPage('home');
}

function completeTutorial() {
  state.sessions.push({ id: 'sess-tour', taskId: 'tour-task' });
  renderPage('home');
}

async function goToStep(index) {
  tour.startTour();
  if (index >= 1) { next().click(); await frames(); }
  if (index >= 2) { addTutorialToPlan(); await vi.advanceTimersByTimeAsync(0); await afterInteractiveStep(); }
  if (index >= 3) { completeTutorial(); await vi.advanceTimersByTimeAsync(0); await afterInteractiveStep(); }
  if (index >= 4) { next().click(); await frames(); }
  if (index >= 5) { next().click(); await frames(); }
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
  document.body.innerHTML = `
    <header id="header">Lv.1</header>
    <main id="content"></main>
    <nav id="nav">
      <button data-page="home"></button>
      <button data-page="review"></button>
      <button data-page="settings"></button>
    </nav>
  `;
  ({ state } = await import('../../pwa/js/state.js'));
  state.tasks = [{ id: 'task-1', name: '閱讀' }];
  state.dailyPlan = [];
  state.sessions = [];
  window.navigate = vi.fn(renderPage);
  tour = await import('../../pwa/js/tour.js');
});

afterEach(async () => {
  // End this test's tour: its observers stay on <body> and would act on the
  // next test's page (each test imports tour.js anew).
  document.getElementById('morning-modal')?.remove();
  await vi.advanceTimersByTimeAsync(0);
  document.querySelector('.tour-tooltip .tour-skip')?.click();
  document.querySelectorAll('.tour-backdrop, .tour-spot, .tour-tooltip').forEach(el => el.remove());
  delete window.Element.prototype.scrollIntoView;
  delete window.navigate;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('導覽的步驟', () => {
  it('第 1 步：聚焦 header，有「下一步」與「跳過」，共 6 步', () => {
    tour.startTour();

    expect(title()).toBe('你的成長指標');
    expect(counter()).toBe('1 / 6');
    expect(next().textContent).toBe('下一步 →');
    expect(skip().textContent).toBe('跳過');
    expect(document.querySelector('.tour-spot')).not.toBeNull();
    expect(document.querySelector('.tour-backdrop').style.pointerEvents).toBe('');
    expect(window.navigate).not.toHaveBeenCalled();
  });

  it('第 2 步：教學任務放在最前面，回到首頁、聚焦它；沒有「下一步」，背景讓點擊通過', async () => {
    tour.startTour();
    next().click();

    expect(state.tasks[0]).toMatchObject({ id: 'tour-task', isTutorial: true, dailyXpCap: 1 });
    expect(window.navigate).toHaveBeenCalledWith('home');
    // 量畫面前先等兩個 frame，讓首頁畫完
    expect(tooltip()).toBeNull();
    await frames();

    expect(title()).toBe('加入今日計劃');
    expect(counter()).toBe('2 / 6');
    expect(tooltip().querySelector('.tour-next')).toBeNull();
    expect(document.querySelector('.tour-backdrop').style.pointerEvents).toBe('none');
  });

  it('把教學任務加入計畫後 600 ms 進到第 3 步；完成後拿掉教學任務，再進到週回顧', async () => {
    await goToStep(1);

    addTutorialToPlan();
    await vi.advanceTimersByTimeAsync(0);
    expect(title()).toBe('加入今日計劃');        // 還在等 600 ms
    await vi.advanceTimersByTimeAsync(599);
    expect(title()).toBe('加入今日計劃');
    await vi.advanceTimersByTimeAsync(1);
    await frames();
    expect(title()).toBe('完成任務 ✓');
    expect(counter()).toBe('3 / 6');
    expect(state.tasks.some(t => t.id === 'tour-task')).toBe(true);

    completeTutorial();
    await vi.advanceTimersByTimeAsync(0);
    // 看到次數標記就拿掉教學任務（記憶體裡的任務與計畫）
    expect(state.tasks.map(t => t.id)).toEqual(['task-1']);
    expect(state.dailyPlan).toEqual([]);
    await afterInteractiveStep();

    expect(window.navigate).toHaveBeenLastCalledWith('review');
    expect(title()).toBe('週回顧');
    expect(counter()).toBe('4 / 6');
  });

  it('設定、最後一步置中；按「完成 ✓」收起並記下已完成', async () => {
    await goToStep(4);
    expect(title()).toBe('設定');
    expect(window.navigate).toHaveBeenLastCalledWith('settings');

    next().click();
    await frames();
    expect(title()).toBe('準備好了！🚀');
    expect(counter()).toBe('6 / 6');
    expect(tooltip().querySelector('.tour-body').innerHTML).toContain('<br>');
    expect(document.querySelector('.tour-backdrop').classList.contains('tour-backdrop-center')).toBe(true);
    expect(tooltip().classList.contains('tour-tooltip-center')).toBe(true);
    expect(document.querySelector('.tour-spot')).toBeNull();
    expect(tour.isTourDone()).toBe(false);
    expect(next().textContent).toBe('完成 ✓');

    next().click();

    expect(next).toThrow();
    expect(document.querySelector('.tour-backdrop, .tour-spot, .tour-tooltip')).toBeNull();
    expect(tour.isTourDone()).toBe(true);
    expect(localStorage.getItem('yoyo_tourDone')).toBe('1');
  });

  it('每一步只留一組畫面（換步時收起上一組）', async () => {
    await goToStep(3);
    expect(document.querySelectorAll('.tour-tooltip')).toHaveLength(1);
    expect(document.querySelectorAll('.tour-backdrop')).toHaveLength(1);
    expect(document.querySelectorAll('.tour-spot')).toHaveLength(1);
  });
});

describe('跳過與中斷', () => {
  it('在第 3 步跳過：拿掉教學任務與計畫、收起畫面、記下已完成；之後計畫卡出現也不再前進', async () => {
    await goToStep(2);

    skip().click();

    expect(state.tasks.map(t => t.id)).toEqual(['task-1']);
    expect(state.dailyPlan).toEqual([]);
    expect(document.querySelector('.tour-backdrop, .tour-spot, .tour-tooltip')).toBeNull();
    expect(tour.isTourDone()).toBe(true);

    state.tasks.unshift({ id: 'tour-task', name: 'x' });
    state.dailyPlan.push('tour-task');
    completeTutorial();
    await vi.advanceTimersByTimeAsync(2000);
    expect(tooltip()).toBeNull();
  });

  it('重新開始時先拿掉上一次中斷留下的教學任務', () => {
    state.tasks.unshift({ id: 'tour-task', name: '完成你的第一個任務' });
    state.dailyPlan = ['tour-task', 'task-1'];

    tour.startTour();

    expect(state.tasks.map(t => t.id)).toEqual(['task-1']);
    expect(state.dailyPlan).toEqual(['task-1']);
    expect(title()).toBe('你的成長指標');
  });

  it('在第 2 步重新開始：教學任務仍只有一個', async () => {
    await goToStep(1);
    tour.startTour();
    next().click();
    await frames();
    expect(state.tasks.filter(t => t.id === 'tour-task')).toHaveLength(1);
  });

  it('要聚焦的元素不在畫面上時跳到下一步', () => {
    document.getElementById('header').remove();
    tour.startTour();
    // 第 2 步要換頁，先換頁再畫
    expect(window.navigate).toHaveBeenCalledWith('home');
    expect(tour.isTourDone()).toBe(false);
  });

  it('要等的元素已經在畫面上時直接前進（計畫裡已有教學任務）', async () => {
    tour.startTour();
    state.dailyPlan = ['tour-task'];
    next().click();
    await frames();
    expect(title()).toBe('加入今日計劃');

    await afterInteractiveStep();
    expect(title()).toBe('完成任務 ✓');
  });
});

describe('位置', () => {
  function rect(el, { left, top, width, height }) {
    el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
  }

  it('聚焦框比目標大 6 px，但不超出畫面', () => {
    rect(document.getElementById('header'), { left: 0, top: 0, width: 375, height: 56 });
    tour.startTour();

    const spot = document.querySelector('.tour-spot').style;
    expect([spot.left, spot.top, spot.width, spot.height]).toEqual(['0px', '0px', '375px', '62px']);
  });

  it('說明在目標下方、水平置中但不超出左右邊界', () => {
    rect(document.getElementById('header'), { left: 0, top: 0, width: 375, height: 56 });
    tour.startTour();

    const style = tooltip().style;
    expect(style.position).toBe('fixed');
    expect(style.width).toBe('288px');
    // 置中是 187.5 − 144 = 43.5；右邊界 375 − 288 − 12 = 75
    expect(style.left).toBe('43.5px');
    // 56 + 6 + 14
    expect(style.top).toBe('76px');
  });

  it('下方放不下時改放上方', () => {
    rect(document.getElementById('header'), { left: 300, top: 560, width: 70, height: 40 });
    tour.startTour();

    // 下方 600 + 20 + 148 > 667 − 12 → 上方 560 − 20 − 148 = 392；靠右時左邊停在 75
    expect(tooltip().style.top).toBe('392px');
    expect(tooltip().style.left).toBe('75px');
  });

  it('上方放不下時改放下方（導覽列在頂端時）', async () => {
    rect(document.querySelector('#nav [data-page="settings"]'), { left: 0, top: 8, width: 20, height: 30 });
    await goToStep(4);

    expect(title()).toBe('設定');
    // 上方 8 − 20 − 148 < 12 → 下方 38 + 20 = 58；左邊不小於 12
    expect(tooltip().style.top).toBe('58px');
    expect(tooltip().style.left).toBe('12px');
  });

  it('很矮的畫面：上下都放不下時貼著上緣', () => {
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true });
    rect(document.getElementById('header'), { left: 0, top: 0, width: 375, height: 56 });
    tour.startTour();

    // 下方 76 + 148 > 188 → 上方 −168 → 不小於 12
    expect(tooltip().style.top).toBe('12px');
  });

  it('目標下半部在畫面外（沒有 scrollIntoView 的瀏覽器）：聚焦框到畫面下緣為止', () => {
    rect(document.getElementById('header'), { left: 0, top: 600, width: 375, height: 100 });
    tour.startTour();

    const spot = document.querySelector('.tour-spot').style;
    // 594 到 min(667, 706)
    expect([spot.top, spot.height]).toEqual(['594px', '73px']);
  });

  it('目標在畫面下方之外（也沒有 scrollIntoView）：說明停在下緣（667 − 148 − 12）', () => {
    rect(document.getElementById('header'), { left: 0, top: 700, width: 375, height: 50 });
    tour.startTour();

    // 下方放不下 → 上方 700 − 168 = 532，仍超出 → 507
    expect(tooltip().style.top).toBe('507px');
  });
});

describe('BUG-144：手機上第一次看到導覽', () => {
  function movable(el, top, height = 120) {
    const box = { top };
    el.getBoundingClientRect = () => ({ left: 16, right: 190, width: 174, top: box.top, bottom: box.top + height, height });
    return box;
  }

  it('教學任務卡在第一屏以下：先捲到畫面中間再聚焦', async () => {
    const scroll = vi.fn(function () { this._box.top = 274; });
    window.Element.prototype.scrollIntoView = scroll;
    const navigate = window.navigate;
    window.navigate = vi.fn(page => {
      navigate(page);
      const card = document.querySelector('.task-card[data-task-id="tour-task"]');
      if (card) card._box = movable(card, 1162);
    });

    tour.startTour();
    next().click();
    await frames();

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0].dataset.taskId).toBe('tour-task');
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    const spot = document.querySelector('.tour-spot').style;
    expect([spot.top, spot.height]).toEqual(['268px', '132px']);
    // 說明在卡片下方：394 + 6 + 14
    expect(tooltip().style.top).toBe('414px');
  });

  it('目標在畫面上方之外（使用者往下捲過）：也捲回來', () => {
    const header = document.getElementById('header');
    const box = movable(header, -300, 56);
    const scroll = vi.fn(() => { box.top = 0; });
    window.Element.prototype.scrollIntoView = scroll;

    tour.startTour();

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.tour-spot').style.height).toBe('62px');
  });

  it('目標已在畫面裡：不捲動', () => {
    movable(document.getElementById('header'), 0, 56);
    const scroll = vi.fn();
    window.Element.prototype.scrollIntoView = scroll;

    tour.startTour();

    expect(scroll).not.toHaveBeenCalled();
    expect(title()).toBe('你的成長指標');
  });

  it('剛好貼著畫面下緣也不捲動', () => {
    movable(document.getElementById('header'), 667 - 56, 56);
    const scroll = vi.fn();
    window.Element.prototype.scrollIntoView = scroll;

    tour.startTour();

    expect(scroll).not.toHaveBeenCalled();
  });

  it('晨間狀態的視窗還開著：導覽等它關掉才開始', async () => {
    const modal = document.createElement('div');
    modal.id = 'morning-modal';
    modal.className = 'modal-overlay';
    document.body.append(modal);

    tour.startTour();
    expect(tooltip()).toBeNull();

    // 其他的畫面變化不算
    document.getElementById('content').innerHTML = '<p>首頁</p>';
    await vi.advanceTimersByTimeAsync(0);
    expect(tooltip()).toBeNull();

    modal.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(title()).toBe('你的成長指標');
  });

  it('導覽進行中晨間視窗出現（例如過了換日時間）再重新開始：先收起原本的一組再等', async () => {
    await goToStep(1);
    const modal = document.createElement('div');
    modal.id = 'morning-modal';
    document.body.append(modal);

    tour.startTour();

    expect(document.querySelector('.tour-backdrop, .tour-spot, .tour-tooltip')).toBeNull();
    modal.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(title()).toBe('你的成長指標');
  });

  it('等待中再開始一次：只出現一組導覽', async () => {
    const modal = document.createElement('div');
    modal.id = 'morning-modal';
    document.body.append(modal);

    tour.startTour();
    tour.startTour();
    modal.remove();
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelectorAll('.tour-tooltip')).toHaveLength(1);
    expect(document.querySelectorAll('.tour-backdrop')).toHaveLength(1);
  });

  it('導覽進行中重新開始（例如從設定頁）：收起原本的一組、回到第 1 步', async () => {
    await goToStep(1);
    expect(document.querySelector('.tour-backdrop').style.pointerEvents).toBe('none');

    tour.startTour();

    expect(document.querySelectorAll('.tour-tooltip')).toHaveLength(1);
    expect(title()).toBe('你的成長指標');
    expect(state.tasks.some(t => t.id === 'tour-task')).toBe(false);
  });
});
