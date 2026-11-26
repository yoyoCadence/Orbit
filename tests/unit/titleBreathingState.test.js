/**
 * @vitest-environment jsdom
 *
 * titleBreathingState.test.js — TEST-005: the parts of the breathing title
 * (pwa/js/titleBreathing.js) that titleBreathing.test.js does not reach:
 * the sun flow's unlock at Lv.50+, the three-day rule before the shown flow
 * changes (and its storage), and the info modal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BREATHING_FLOWS,
  calculateBreathingProfile,
  getBreathingTitle,
  loadBreathingFlowState,
  saveBreathingFlowState,
  showBreathingInfoModal,
  updateBreathingFlowState,
} from '../../pwa/js/titleBreathing.js';

const TODAY = '2026-03-31';
const TASKS = [
  // S, hard, focus: flame, stone and mist.
  { id: 's', name: '寫報告', value: 'S', resistance: 1.4, difficulty: 1.0, category: 'focus' },
  // A, focus, 50 minutes: water and mist.
  { id: 'a', name: '讀書', value: 'A', resistance: 1.0, difficulty: 0.7, category: 'focus' },
  { id: 'b', name: '整理', value: 'B', resistance: 1.0, difficulty: 0.7, category: 'focus' },
  { id: 'i', name: '回信', value: 'A', resistance: 1.0, difficulty: 0.7, category: 'instant' },
];

/** One 80 XP session a day for `days` days up to TODAY; every day counts as effective. */
function history({ days = 30, pick = index => (index % 2 ? 'a' : 's') } = {}) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(`${TODAY}T00:00:00`);
    date.setDate(date.getDate() - index);
    return {
      taskId: pick(index), date: date.toLocaleDateString('sv'), durationMinutes: 50, finalXP: 80,
      isProductiveXP: true, impactType: 'task', value: 'A', result: 'complete',
    };
  });
}

const profile = (sessions, level = 50) => calculateBreathingProfile({
  sessions, tasks: TASKS, level, streakDays: 30, today: TODAY,
});

describe('sun flow unlock (Lv.50+)', () => {
  it('unlocks with a steady, balanced, high-value month at Lv.50, and not below it', () => {
    const sessions = history();
    expect(profile(sessions, 49).sunUnlocked).toBe(false);
    const unlocked = profile(sessions, 50);
    // Top three (mist 41, stone 25, flame 24) 90% >= 75; top flow 41% < 45;
    // every day effective; all XP from S and A tasks.
    expect(unlocked.ranked.slice(0, 3).map(entry => entry.key)).toEqual(['mist', 'stone', 'flame']);
    expect(unlocked.sunUnlocked).toBe(true);
  });

  // (The five-session floor cannot decide on its own: 70% effective days
  // already takes 21 days with a productive session.)
  it('needs 70% effective days in the last 30', () => {
    expect(profile(history({ days: 21 })).sunUnlocked).toBe(true);
    expect(profile(history({ days: 20 })).sunUnlocked).toBe(false);
  });

  it('needs 60% of the XP from S and A tasks', () => {
    // Half the XP from a B task; the flows still pass (top three 83%, top flow 38%).
    const sessions = history({ pick: index => (index % 2 ? 'b' : 's') });
    const result = profile(sessions);
    expect(result.ranked.slice(0, 3).reduce((sum, entry) => sum + entry.pct, 0)).toBeGreaterThanOrEqual(75);
    expect(result.sunUnlocked).toBe(false);
  });

  it('needs the top three flows to make 75%', () => {
    const result = profile(history({ pick: index => ['s', 'a', 'b', 'i'][index % 4] }));
    expect(result.ranked.slice(0, 3).reduce((sum, entry) => sum + entry.pct, 0)).toBeLessThan(75);
    expect(result.sunUnlocked).toBe(false);
  });

  it('is not unlocked while one flow dominates (45% or more)', () => {
    const result = profile(history({ pick: () => 'a' }));
    expect(result.ranked[0]).toEqual({ key: 'mist', pct: 68 });
    expect(result.sunUnlocked).toBe(false);
  });

  it('lets an unlocked sun flow lead the title, and keeps a locked one out of it', () => {
    const base = profile(history());
    const ranked = [{ key: 'sun', pct: 50 }, ...base.ranked.filter(entry => entry.key !== 'sun')];
    const flows = { ...base.flows, sun: { score: 1, pct: 50 } };
    expect(getBreathingTitle({ level: 50, profile: { ...base, ranked, flows, sunUnlocked: true } }).flow).toBe('sun');
    expect(getBreathingTitle({ level: 50, profile: { ...base, ranked, flows, sunUnlocked: false } }).flow).not.toBe('sun');
  });
});

describe('flow stability: a new flow must lead three days in a row', () => {
  beforeEach(() => localStorage.clear());

  it('takes the first winner at once, then needs three straight days from a challenger', () => {
    let state = updateBreathingFlowState('2026-03-01', 'water', {});
    expect(state).toMatchObject({ currentFlow: 'water', candidateFlow: null, candidateDays: 0, lastDate: '2026-03-01' });
    state = updateBreathingFlowState('2026-03-02', 'flame', state);
    expect(state).toMatchObject({ currentFlow: 'water', candidateFlow: 'flame', candidateDays: 1 });
    state = updateBreathingFlowState('2026-03-03', 'flame', state);
    expect(state).toMatchObject({ currentFlow: 'water', candidateDays: 2 });
    state = updateBreathingFlowState('2026-03-04', 'flame', state);
    expect(state).toMatchObject({ currentFlow: 'flame', candidateFlow: null, candidateDays: 0 });
  });

  it('resets the count when the shown flow wins a day or another challenger appears', () => {
    let state = { currentFlow: 'water', candidateFlow: 'flame', candidateDays: 2, lastDate: '2026-03-01' };
    state = updateBreathingFlowState('2026-03-02', 'water', state);
    expect(state).toMatchObject({ currentFlow: 'water', candidateFlow: null, candidateDays: 0 });
    state = updateBreathingFlowState('2026-03-03', 'flame', state);
    state = updateBreathingFlowState('2026-03-04', 'flame', state);
    state = updateBreathingFlowState('2026-03-05', 'mist', state);
    expect(state).toMatchObject({ currentFlow: 'water', candidateFlow: 'mist', candidateDays: 1 });
  });

  it('counts each day once, and changes nothing without a winner', () => {
    const state = { currentFlow: 'water', candidateFlow: 'flame', candidateDays: 1, lastDate: '2026-03-02' };
    expect(updateBreathingFlowState('2026-03-02', 'flame', state)).toEqual(state);
    expect(updateBreathingFlowState('2026-03-03', null, state)).toBe(state);
  });

  it('keeps its state on this device, and starts over from bad stored data', () => {
    const state = updateBreathingFlowState('2026-03-01', 'thunder');
    expect(loadBreathingFlowState()).toEqual(state);
    // The stored state is used when none is passed.
    expect(updateBreathingFlowState('2026-03-02', 'stone')).toMatchObject({ currentFlow: 'thunder', candidateFlow: 'stone' });
    expect(updateBreathingFlowState('2026-03-03', null)).toMatchObject({ candidateFlow: 'stone', candidateDays: 1 });
    localStorage.setItem('orbit_breathing_flow', '{not json');
    expect(loadBreathingFlowState()).toEqual({});
  });

  it('does not throw when storage is full', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new window.DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveBreathingFlowState({ currentFlow: 'water' })).not.toThrow();
    expect(updateBreathingFlowState('2026-03-01', 'water', {}).currentFlow).toBe('water');
    setItem.mockRestore();
  });
});

describe('info modal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const modal = () => document.getElementById('breathing-info-modal');

  it('shows the title, the flows by share with the main and second flows marked, and every flow', () => {
    const data = profile(history(), 30);
    const title = getBreathingTitle({ level: 30, profile: data });
    showBreathingInfoModal({ profile: data, titleResult: title });
    const root = modal();
    expect(root.querySelector('.br-current-title').textContent).toBe(title.displayTitle);
    const rows = [...root.querySelectorAll('.br-flow-row')];
    expect(rows).toHaveLength(Object.keys(BREATHING_FLOWS).length);
    // Highest share first; the main flow carries a star.
    expect(rows[0].querySelector('.br-flow-name').textContent).toContain(`${BREATHING_FLOWS[title.flow].label} ★`);
    expect(rows[0].querySelector('.br-bar-main').style.width).toBe(`${data.flows[title.flow].pct}%`);
    expect(root.querySelectorAll('.br-table tbody tr')).toHaveLength(Object.keys(BREATHING_FLOWS).length);
    expect(root.querySelector('.br-row-active .br-td-name').textContent).toContain(BREATHING_FLOWS[title.flow].label);
    expect(root.textContent).toContain(`${data.sessionCount} 筆有效任務`);
    // Below Lv.50 the sun flow is locked, and the unlock rule is explained.
    expect(root.querySelector('.br-locked-badge')).not.toBe(null);
    expect(root.querySelector('.br-note-row').textContent).toContain('日之呼吸解鎖條件');
  });

  it('marks the second flow of a dual title, and shows training without a title', () => {
    const data = profile(history(), 50);
    showBreathingInfoModal({
      profile: data,
      titleResult: { flow: 'mist', flow2: 'stone', displayTitle: '霞岩之呼吸・壹之型', reason: '差距 <b>9%</b>' },
    });
    const root = modal();
    expect(root.querySelector('.br-sub-flow').textContent).toBe(`副流派：${BREATHING_FLOWS.stone.label}`);
    expect(root.querySelector('.br-bar-sub')).not.toBe(null);
    // Text from the title is escaped, not markup.
    expect(root.querySelector('.br-reason').innerHTML).toBe('差距 &lt;b&gt;9%&lt;/b&gt;');
    // Unlocked: no lock and no unlock note.
    expect(root.querySelector('.br-note-row')).toBe(null);

    showBreathingInfoModal({ profile: data, titleResult: null });
    expect(document.querySelectorAll('#breathing-info-modal')).toHaveLength(1);
    expect(modal().querySelector('.br-current-title').textContent).toBe('全集中修練中');
  });

  it('closes with its button or a tap outside the box', () => {
    const data = profile(history(), 30);
    showBreathingInfoModal({ profile: data, titleResult: null });
    modal().querySelector('.br-modal-box').click();
    expect(modal()).not.toBe(null);
    modal().click();
    expect(modal()).toBe(null);
    showBreathingInfoModal({ profile: data, titleResult: null });
    modal().querySelector('#br-modal-close').click();
    expect(modal()).toBe(null);
  });
});
