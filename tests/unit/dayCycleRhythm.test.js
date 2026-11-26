// @vitest-environment jsdom
/**
 * dayCycleRhythm.test.js — TEST-007: the parts of pwa/js/dayCycle.js that
 * dayCycle.test.js (BUG-105/106, the modals never freezing) does not reach:
 * the weekly consistency bonus, the cross-day watcher, what the morning
 * report says about yesterday, the streak shield's confirm and info popover,
 * and the 45-day unlock celebration. The real engine computes the day stats.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  saveUser: vi.fn(() => true),
  saveEnergy: vi.fn(() => true),
  isProUser: vi.fn(() => false),
  getDailyPlan: vi.fn(() => []),
}));
const feedback = vi.hoisted(() => ({ showToast: vi.fn(), showXPFloat: vi.fn() }));
const renderPageMock = vi.hoisted(() => vi.fn());
const updateHeaderMock = vi.hoisted(() => vi.fn());
const themeMock = vi.hoisted(() => ({ applyRandomThemeForToday: vi.fn() }));

vi.mock('../../pwa/js/storage.js', () => ({
  storage: storageMock,
  db: { upsertProfile: vi.fn(() => Promise.resolve(true)) },
}));
vi.mock('../../pwa/js/ui/feedback.js', () => feedback);
vi.mock('../../pwa/js/router.js', () => ({ renderPage: renderPageMock, currentHash: () => 'home' }));
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: updateHeaderMock }));
vi.mock('../../pwa/js/theme.js', () => themeMock);

const { state } = await import('../../pwa/js/state.js');
const { FLAG_SHIELD_DISMISSED, FLAG_SHIELD_SCROLL_TOP } = await import('../../pwa/js/flags.js');
const {
  checkWeeklyBonus, showDailyReport, showStreakUnlockModal, startDayWatcher,
} = await import('../../pwa/js/dayCycle.js');

/** A session on `date`; by default one that makes the day effective (A task, 60 XP). */
function session(date, overrides = {}) {
  return {
    date, taskId: 't-a', taskName: '寫報告', taskEmoji: '📝', value: 'A', impactType: 'task',
    finalXP: 60, isProductiveXP: true, result: 'complete', durationMinutes: 30, ...overrides,
  };
}

const day = (base, offset) => {
  const date = new Date(`${base}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('sv');
};

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  sessionStorage.clear();
  state.user = { id: 'u1', name: 'Tester', newDayHour: 0, streakDays: 0, totalXP: 100 };
  state.sessions = [];
  state.energy = { currentEnergy: 90, maxEnergy: 100, lastResetDate: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('weekly consistency bonus', () => {
  // 2026-11-23 is a Monday; the week before is 11-16 to 11-22.
  const MONDAY = '2026-11-23';

  function at(date) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${date}T09:00:00`));
  }

  it('gives 60 XP on Monday for five effective days in the last seven, once', () => {
    at(MONDAY);
    state.sessions = [1, 2, 3, 5, 7].map(back => session(day(MONDAY, -back)));
    checkWeeklyBonus();
    expect(state.user.totalXP).toBe(160);
    expect(state.user.lastWeeklyBonusDate).toBe(MONDAY);
    expect(storageMock.saveUser).toHaveBeenCalledWith(state.user);
    expect(updateHeaderMock).toHaveBeenCalled();
    expect(feedback.showXPFloat).toHaveBeenCalledWith('+60 XP 週一致性獎勵！');
    checkWeeklyBonus();
    expect(state.user.totalXP).toBe(160);
  });

  it('gives nothing for four effective days, or for days outside the week', () => {
    at(MONDAY);
    // Today and eight days ago do not count.
    state.sessions = [0, 1, 2, 3, 4, 8].map(back => session(day(MONDAY, -back)))
      // A day with only B work is not effective.
      .concat(session(day(MONDAY, -5), { value: 'B' }));
    checkWeeklyBonus();
    expect(state.user.totalXP).toBe(100);
    expect(feedback.showXPFloat).not.toHaveBeenCalled();
  });

  it('only checks on Mondays, and needs a signed-in user', () => {
    at('2026-11-24');
    state.sessions = [1, 2, 3, 4, 5, 6, 7].map(back => session(day('2026-11-24', -back)));
    checkWeeklyBonus();
    expect(state.user.totalXP).toBe(100);
    at(MONDAY);
    state.user = null;
    expect(() => checkWeeklyBonus()).not.toThrow();
  });

  it('counts the Monday of the user\'s own day: before their new-day hour it is still Sunday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${MONDAY}T03:00:00`));
    state.user.newDayHour = 5;
    state.sessions = [1, 2, 3, 4, 5].map(back => session(day(MONDAY, -back)));
    checkWeeklyBonus();
    expect(state.user.totalXP).toBe(100);
  });
});

describe('cross-day watcher', () => {
  it('on a new day reloads the plan, applies the day\'s theme and shows the report; once started, never twice', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T23:58:30'));
    state.energy.lastResetDate = '2026-11-26';
    storageMock.getDailyPlan.mockReturnValue([{ id: 'p1' }]);
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    startDayWatcher();
    startDayWatcher();
    expect(setInterval).toHaveBeenCalledTimes(1);

    // Still the same day: nothing.
    vi.advanceTimersByTime(60_000);
    expect(storageMock.getDailyPlan).not.toHaveBeenCalled();
    expect(document.getElementById('daily-report-modal')).toBe(null);

    // Past midnight.
    vi.advanceTimersByTime(60_000);
    expect(state.dailyPlan).toEqual([{ id: 'p1' }]);
    expect(themeMock.applyRandomThemeForToday).toHaveBeenCalledTimes(1);
    expect(document.getElementById('daily-report-modal')).not.toBe(null);

    // The same new day again: nothing more.
    vi.advanceTimersByTime(60_000);
    expect(themeMock.applyRandomThemeForToday).toHaveBeenCalledTimes(1);

    // The next day, with the energy already reset (another tab): no report.
    document.body.innerHTML = '';
    state.energy.lastResetDate = '2026-11-28';
    vi.setSystemTime(new Date('2026-11-28T00:00:30'));
    vi.advanceTimersByTime(60_000);
    expect(themeMock.applyRandomThemeForToday).toHaveBeenCalledTimes(2);
    expect(document.getElementById('daily-report-modal')).toBe(null);

    // Signed out by then (the day then starts at the default 05:00): the day
    // still moves on, nothing is shown.
    state.user = null;
    vi.setSystemTime(new Date('2026-11-29T06:00:30'));
    vi.advanceTimersByTime(60_000);
    expect(themeMock.applyRandomThemeForToday).toHaveBeenCalledTimes(2);
  });
});

describe('morning report about yesterday', () => {
  const TODAY = '2026-11-26';
  const YESTERDAY = '2026-11-25';

  function report({ streak = 0, sessions = [] } = {}) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T08:00:00`));
    state.user.streakDays = streak;
    state.sessions = sessions;
    showDailyReport(() => {});
    const modal = document.getElementById('daily-report-modal');
    return {
      badge: modal.querySelector('.rpt-badge').textContent.trim(),
      tips: [...modal.querySelectorAll('.rpt-tip')].map(tip => tip.textContent.trim()),
      chips: [...modal.querySelectorAll('.rpt-chip')].map(chip => chip.textContent),
      stats: [...modal.querySelectorAll('.rpt-stat-val')].map(value => value.textContent),
      modal,
    };
  }

  it('calls a day without sessions a rest day', () => {
    const { badge, tips, chips } = report({ sessions: [session('2026-11-24')] });
    expect(badge).toBe('😴 休息日');
    expect(tips).toEqual(['🌟昨天是休息日，今天精力充沛，好好發揮！']);
    expect(chips).toEqual([]);
  });

  it('suggests what was missing: an A or S task, less play, the XP to an effective day (three at most)', () => {
    const { badge, tips } = report({
      sessions: [
        session(YESTERDAY, { value: 'B', finalXP: 30 }),
        session(YESTERDAY, { impactType: 'entertainment', isProductiveXP: false, finalXP: 0, durationMinutes: 150, value: 'C' }),
      ],
    });
    expect(badge).toBe('⬆️ 成長中');
    expect(tips).toEqual([
      '🎯今天安排一個 A 或 S 級的重要任務',
      '⚖️昨天娛樂時間 2.5hr，今天保持平衡',
      '📈再 20 XP 就達有效日，今天衝一波！',
    ]);
  });

  it('cheers an effective day with a streak, and a fresh start after a missed one', () => {
    let result = report({ streak: 4, sessions: [session(YESTERDAY)] });
    expect(result.badge).toBe('✅ 有效日');
    expect(result.tips).toEqual(['🔥4 天連勝中！繼續保持節奏']);
    document.body.innerHTML = '';
    result = report({ streak: 0, sessions: [session(YESTERDAY, { value: 'A', finalXP: 20 })] });
    expect(result.tips).toEqual(['📈再 30 XP 就達有效日，今天衝一波！', '💪今天重新出發，完成一個有效日！']);
    document.body.innerHTML = '';
    // Only play yesterday: no XP to count toward an effective day.
    result = report({
      streak: 0,
      sessions: [session(YESTERDAY, { impactType: 'entertainment', isProductiveXP: false, finalXP: 0, durationMinutes: 60, value: 'C' })],
    });
    expect(result.tips).toEqual(['🎯今天安排一個 A 或 S 級的重要任務', '💪今天重新出發，完成一個有效日！']);
    document.body.innerHTML = '';
    // Nothing to point out.
    result = report({ streak: 0, sessions: [session(YESTERDAY)] });
    expect(result.tips).toEqual(['🌱保持穩定節奏，每天進步一點點']);
  });

  it('counts yesterday\'s XP, its valid tasks by value, and the top three tasks by XP', () => {
    const { stats, chips, modal } = report({
      streak: 2,
      // Not in XP order: the report sorts them.
      sessions: [
        session(YESTERDAY, { taskId: 'c', taskName: '回信', value: 'C', finalXP: 5 }),
        session(YESTERDAY, { taskId: 'a', taskName: '讀書', finalXP: 40 }),
        session(YESTERDAY, { taskId: 'b', taskName: '整理', value: 'B', finalXP: 10 }),
        session(YESTERDAY, { taskId: 's', taskName: '大報告', value: 'S', finalXP: 90 }),
        session(YESTERDAY, { taskId: 'x', taskName: '分心', value: 'A', finalXP: 0, result: 'invalid' }),
        session(YESTERDAY, { taskId: 'a', taskName: '讀書', finalXP: 40 }),
      ],
    });
    expect(stats).toEqual(['185', '5', '2🔥']);
    expect(chips).toEqual(['S×1', 'A×2', 'B×1', 'C×1']);
    expect([...modal.querySelectorAll('.rpt-task-row')].map(row => row.querySelector('.rpt-task-name').textContent))
      .toEqual(['大報告', '讀書', '整理']);
    expect(modal.querySelector('.rpt-task-row .rpt-task-xp').textContent).toBe('+90 XP');
  });

  it('reads yesterday from the user\'s own day: before their new-day hour, today is still yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T03:00:00`));
    state.user.newDayHour = 5;
    // At 03:00 on the 26th the user's day is the 25th, so "yesterday" is the 24th.
    state.sessions = [session('2026-11-24')];
    showDailyReport(() => {});
    expect(document.querySelector('#daily-report-modal .rpt-badge').textContent.trim()).toBe('✅ 有效日');
  });
});

describe('streak shield', () => {
  it('asks before giving the shield up; cancel keeps the banner, confirm hides it for this session', () => {
    window.dismissStreakShield();
    const overlay = () => document.querySelector('.shield-confirm-overlay');
    overlay().querySelector('.shield-confirm-cancel').click();
    expect(overlay()).toBe(null);
    expect(sessionStorage.getItem(FLAG_SHIELD_DISMISSED)).toBe(null);
    expect(renderPageMock).not.toHaveBeenCalled();
    window.dismissStreakShield();
    overlay().querySelector('#shield-confirm-ok-btn').click();
    expect(overlay()).toBe(null);
    expect(sessionStorage.getItem(FLAG_SHIELD_DISMISSED)).toBe('1');
    expect(renderPageMock).toHaveBeenCalledWith('home');
  });

  it('brings the banner back from the streak pill, at the top of home', () => {
    sessionStorage.setItem(FLAG_SHIELD_DISMISSED, '1');
    const navigate = vi.fn();
    window.navigate = navigate;
    window.reshowShieldBanner();
    expect(sessionStorage.getItem(FLAG_SHIELD_DISMISSED)).toBe(null);
    expect(sessionStorage.getItem(FLAG_SHIELD_SCROLL_TOP)).toBe('1');
    expect(navigate).toHaveBeenCalledWith('home');
  });

  it('explains the shield in a popover under its button, one at a time, closed by the next tap', () => {
    vi.useFakeTimers();
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ bottom: 120, left: 40 });
    document.body.append(anchor);
    window.showShieldInfo(anchor);
    window.showShieldInfo(anchor);
    const popovers = document.querySelectorAll('.shield-info-popover');
    expect(popovers).toHaveLength(1);
    expect(popovers[0].textContent).toContain('每月自動重置為 2 張');
    expect(popovers[0].style.top).toBe('126px');
    // Kept 8 px from the left edge.
    expect(popovers[0].style.left).toBe('8px');
    // The tap that opened it does not close it.
    document.body.click();
    expect(document.querySelector('.shield-info-popover')).not.toBe(null);
    vi.advanceTimersByTime(10);
    document.body.click();
    expect(document.querySelector('.shield-info-popover')).toBe(null);
  });
});

describe('45-day unlock celebration', () => {
  it('celebrates the free Pro month, once, and refreshes the page when closed', () => {
    showStreakUnlockModal();
    showStreakUnlockModal();
    const modals = document.querySelectorAll('#streak-unlock-modal');
    expect(modals).toHaveLength(1);
    expect(modals[0].textContent).toContain('30天免費 Pro');
    modals[0].querySelector('#su-close-btn').click();
    expect(document.getElementById('streak-unlock-modal')).toBe(null);
    expect(renderPageMock).toHaveBeenCalledWith('home');
  });
});
