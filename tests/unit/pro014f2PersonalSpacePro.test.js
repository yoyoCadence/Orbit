// @vitest-environment jsdom
/**
 * PRO-014F2 F2A (owner decision 2026-11-19, proposal §9 as recommended).
 * - proPresence.js: the mark only for a known Pro; the one-day line only on the
 *   day a known not-Pro becomes Pro on this device; "unknown" shows, says and
 *   records nothing; the first record says nothing; per account.
 * - The snapshot replaces only the Companion's line, never over a pending
 *   reveal; the mark reaches the view models.
 * - The Orbit Window shows the mark on the home card only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => ({ value: 'pro', signedIn: true }));
vi.mock('../../pwa/js/proRollover.js', () => ({ getProRolloverStatus: () => status.value }));
vi.mock('../../pwa/js/sessionPresence.js', () => ({ hasStoredSession: () => status.signedIn }));

import { PRO_STARTED_LINE, resolveProPresence } from '../../pwa/js/personalSpace/v2/proPresence.js';
import {
  buildFullWorldViewModel,
  buildHomeWindowViewModel,
  buildPersonalSpaceV2Snapshot,
} from '../../pwa/js/personalSpace/v2/viewModels.js';
import { renderOrbitWindow } from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import { getCompanionDialogue } from '../../pwa/js/personalSpace/v2/content/companionDialogue.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const seen = owner => JSON.parse(localStorage.getItem(`orbit_ps_pro_seen:${encodeURIComponent(owner)}`));
const day = (n = 0) => `2026-11-${String(19 + n).padStart(2, '0')}`;

beforeEach(() => {
  localStorage.clear();
  status.value = 'pro';
  status.signedIn = true;
});

describe('proPresence', () => {
  it('shows the mark for a known Pro; the first record says nothing', () => {
    expect(resolveProPresence(OWNER, { today: day() })).toEqual({ status: 'pro', showMark: true, companionKey: null });
    expect(seen(OWNER)).toEqual({ status: 'pro', changedOn: null });
  });

  it('says the line on the day a known not-Pro becomes Pro, and only that day', () => {
    status.value = 'not-pro';
    expect(resolveProPresence(OWNER, { today: day() })).toMatchObject({ showMark: false, companionKey: null });
    status.value = 'pro';
    expect(resolveProPresence(OWNER, { today: day(1) }).companionKey).toBe(PRO_STARTED_LINE);
    expect(resolveProPresence(OWNER, { today: day(1) }).companionKey).toBe(PRO_STARTED_LINE); // same day
    expect(resolveProPresence(OWNER, { today: day(2) })).toEqual({ status: 'pro', showMark: true, companionKey: null });
  });

  it('shows, says and records nothing while the status is unknown (a stale projection)', () => {
    resolveProPresence(OWNER, { today: day() }); // pro
    status.value = 'unknown';
    expect(resolveProPresence(OWNER, { today: day(1) })).toEqual({ status: 'unknown', showMark: false, companionKey: null });
    expect(seen(OWNER)).toEqual({ status: 'pro', changedOn: null });
    status.value = 'pro';
    // Back to a known Pro: not a new start.
    expect(resolveProPresence(OWNER, { today: day(2) }).companionKey).toBeNull();
  });

  it('says nothing when Pro ends; the mark goes', () => {
    resolveProPresence(OWNER, { today: day() });
    status.value = 'not-pro';
    expect(resolveProPresence(OWNER, { today: day(1) })).toEqual({ status: 'not-pro', showMark: false, companionKey: null });
    expect(seen(OWNER)).toEqual({ status: 'not-pro', changedOn: day(1) });
  });

  it('keeps each account apart, and nothing for a guest', () => {
    status.value = 'not-pro';
    resolveProPresence(OWNER, { today: day() });
    status.value = 'pro';
    expect(resolveProPresence(OTHER, { today: day(1) }).companionKey).toBeNull(); // OTHER's first record
    expect(resolveProPresence(OWNER, { today: day(1) }).companionKey).toBe(PRO_STARTED_LINE);
    status.signedIn = false;
    localStorage.clear();
    expect(resolveProPresence(OWNER, { today: day(1) })).toEqual({ status: 'unknown', showMark: false, companionKey: null });
    expect(localStorage.length).toBe(0);
  });
});

describe('snapshot and view models', () => {
  const base = {
    coreState: { user: { id: OWNER }, tasks: [], dailyPlan: [], sessions: [] },
    v2State: { world: {}, economy: {}, hiddenStats: {}, companion: {} },
    ledgerSnapshot: {},
    effectiveDate: day(),
    now: new Date(2026, 10, 19, 12),
  };
  const presence = { status: 'pro', showMark: true, companionKey: PRO_STARTED_LINE };

  it('replaces only the Companion line, and carries the mark to both surfaces', () => {
    const plain = buildPersonalSpaceV2Snapshot(base);
    const snapshot = buildPersonalSpaceV2Snapshot({ ...base, coreState: { ...base.coreState, proPresence: presence } });
    expect(snapshot.companion.dialogueKey).toBe(PRO_STARTED_LINE);
    expect(snapshot.companion.state).toBe(plain.companion.state);
    expect(snapshot.companion.animationKey).toBe(plain.companion.animationKey);
    expect(snapshot.companion.worldAction).toBe(plain.companion.worldAction);
    expect(snapshot.proMark).toBe(true);
    expect(plain.proMark).toBe(false);
    expect(buildHomeWindowViewModel(snapshot).proMark).toBe(true);
    expect(buildFullWorldViewModel(snapshot).proMark).toBe(true);
    expect(getCompanionDialogue(PRO_STARTED_LINE)).toBe('Pro 已開啟。這裡的一切照舊，你累積的每一步都算數。');
  });

  it('never replaces the line over a pending reveal', () => {
    const snapshot = buildPersonalSpaceV2Snapshot({
      ...base,
      coreState: { ...base.coreState, proPresence: presence },
      ledgerSnapshot: { pendingRewardReveals: [{ id: 'reward-1', kind: 'small' }] },
    });
    expect(snapshot.pendingReveal).not.toBeNull();
    expect(snapshot.companion.dialogueKey).not.toBe(PRO_STARTED_LINE);
  });
});

describe('Orbit Window', () => {
  const render = (renderMode, proMark) => {
    const host = document.createElement('div');
    host.innerHTML = renderOrbitWindow({ momentum: 'stable', proMark, renderMode }, { renderMode });
    return host;
  };

  it('shows the mark on the home card only (the full page has it in its HUD)', () => {
    const home = render('home-window', true).querySelector('.orbit-window-pro');
    expect(home?.textContent).toBe('✦ Pro');
    expect(home?.getAttribute('aria-label')).toBe('Orbit Pro 會員');
    expect(render('full-world', true).querySelector('.orbit-window-pro')).toBeNull();
    expect(render('edit', true).querySelector('.orbit-window-pro')).toBeNull();
    expect(render('home-window', false).querySelector('.orbit-window-pro')).toBeNull();
  });
});
