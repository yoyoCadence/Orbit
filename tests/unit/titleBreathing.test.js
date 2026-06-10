/**
 * titleBreathing.test.js
 *
 * Tests for the dynamic breathing-style title system (呼吸流派稱號).
 * All pure functions — no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest';
import {
  BREATHING_FLOWS,
  BREATHING_TECHNIQUES,
  getTechnique,
  calculateBreathingProfile,
  getBreathingTitle,
} from '../../pwa/js/titleBreathing.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TODAY = '2026-01-15';

/** Build a session object with sensible defaults. */
function makeSession({ taskId = 't1', date = '2026-01-10', durationMinutes = 30,
  finalXP = 50, isProductiveXP = true } = {}) {
  return { taskId, date, durationMinutes, finalXP, isProductiveXP, result: 'complete' };
}

/** Repeat a session N times on slightly spread dates. */
function repeatSession(n, overrides = {}) {
  return Array.from({ length: n }, (_, i) => makeSession({
    date: `2026-01-${String(10 - i).padStart(2, '0')}`,
    ...overrides,
  }));
}

// ─── BREATHING_FLOWS ─────────────────────────────────────────────────────────

describe('BREATHING_FLOWS', () => {
  it('has exactly 10 flows', () => {
    expect(Object.keys(BREATHING_FLOWS)).toHaveLength(10);
  });

  it('each flow has required fields', () => {
    for (const f of Object.values(BREATHING_FLOWS)) {
      expect(f).toHaveProperty('key');
      expect(f).toHaveProperty('label');
      expect(f).toHaveProperty('character');
      expect(f).toHaveProperty('tendency');
      expect(f).toHaveProperty('howToIncrease');
      expect(f).toHaveProperty('unlockRule');
    }
  });

  it('sun flow has non-trivial unlockRule', () => {
    expect(BREATHING_FLOWS.sun.unlockRule).toMatch(/Lv\.50/);
  });
});

// ─── BREATHING_TECHNIQUES ────────────────────────────────────────────────────

describe('BREATHING_TECHNIQUES', () => {
  it('every flow in BREATHING_FLOWS has a techniques array', () => {
    for (const key of Object.keys(BREATHING_FLOWS)) {
      expect(Array.isArray(BREATHING_TECHNIQUES[key])).toBe(true);
      expect(BREATHING_TECHNIQUES[key].length).toBeGreaterThan(0);
    }
  });

  it('water has 11 techniques', () => {
    expect(BREATHING_TECHNIQUES.water).toHaveLength(11);
  });

  it('sun has 14 techniques', () => {
    expect(BREATHING_TECHNIQUES.sun).toHaveLength(14);
  });
});

// ─── getTechnique ─────────────────────────────────────────────────────────────

describe('getTechnique', () => {
  it('Lv.1 → first technique (index 0)', () => {
    expect(getTechnique('water', 1)).toBe('壹之型・水面切');
  });

  it('Lv.2 → still index 0 (same 2-level stage)', () => {
    expect(getTechnique('water', 2)).toBe('壹之型・水面切');
  });

  it('Lv.3 → index 1', () => {
    expect(getTechnique('water', 3)).toBe('貳之型・水車');
  });

  it('Lv.21 → index 10 (first Lv.21–50 stage, water[10] = 拾壹之型・凪)', () => {
    // index = 10 + floor((21-21)/3) = 10; water has 11 entries (0..10), so [10] = last one
    expect(getTechnique('water', 21)).toBe('拾壹之型・凪');
  });

  it('Lv.51 → index 20 (first Lv.51–80 stage)', () => {
    // water has 11 techniques; index 20 clamps to 10 (last)
    expect(getTechnique('water', 51)).toBe('拾壹之型・凪');
  });

  it('very high level clamps to last technique', () => {
    expect(getTechnique('flame', 120)).toBe('奧義 玖之型・煉獄');
  });

  it('Lv.20 → index 9 (boundary of first range)', () => {
    // index = floor((20-1)/2) = floor(19/2) = 9
    // water index 9 = '拾之型・生生流轉'
    expect(getTechnique('water', 20)).toBe('拾之型・生生流轉');
  });
});

// ─── calculateBreathingProfile — flow scoring ────────────────────────────────

describe('calculateBreathingProfile – S + high resistance focus → flame/stone high', () => {
  const task = { id: 't1', value: 'S', resistance: 1.4, difficulty: 1.0, category: 'focus', name: '深度工作' };
  const sessions = repeatSession(8, { taskId: 't1', durationMinutes: 60 });

  const profile = calculateBreathingProfile({
    sessions, tasks: [task], level: 10, streakDays: 0, today: TODAY,
  });

  it('has enough data', () => {
    expect(profile.hasEnoughData).toBe(true);
  });

  it('flame pct is among the top 2', () => {
    const topKeys = profile.ranked.slice(0, 2).map(r => r.key);
    expect(topKeys).toContain('flame');
  });

  it('stone pct is among the top 3', () => {
    const topKeys = profile.ranked.slice(0, 3).map(r => r.key);
    expect(topKeys).toContain('stone');
  });

  it('flame + stone both outperform thunder / beast / wind', () => {
    const f = profile.flows;
    expect(f.flame.pct).toBeGreaterThan(f.thunder.pct);
    expect(f.stone.pct).toBeGreaterThan(f.beast.pct);
    expect(f.stone.pct).toBeGreaterThan(f.wind.pct);
  });
});

describe('calculateBreathingProfile – long focus learning tasks → mist high', () => {
  const task = { id: 't1', value: 'A', resistance: 1.0, difficulty: 0.7, category: 'focus', name: '閱讀技術書' };
  const sessions = repeatSession(8, { taskId: 't1', durationMinutes: 90 });

  const profile = calculateBreathingProfile({
    sessions, tasks: [task], level: 10, streakDays: 0, today: TODAY,
  });

  it('mist is the top flow', () => {
    expect(profile.ranked[0].key).toBe('mist');
  });

  it('mist pct clearly dominates', () => {
    expect(profile.flows.mist.pct).toBeGreaterThan(20);
  });
});

describe('calculateBreathingProfile – instant tasks → thunder high', () => {
  const task = { id: 't1', value: 'B', resistance: 1.0, difficulty: 0.7, category: 'instant', name: '快速任務' };
  const sessions = repeatSession(10, { taskId: 't1', durationMinutes: 10 });

  const profile = calculateBreathingProfile({
    sessions, tasks: [task], level: 10, streakDays: 0, today: TODAY,
  });

  it('thunder is the top flow', () => {
    expect(profile.ranked[0].key).toBe('thunder');
  });
});

describe('calculateBreathingProfile – 運動 tasks → beast high', () => {
  const task = { id: 't1', value: 'A', resistance: 1.0, difficulty: 0.7, category: 'instant', name: '早晨運動' };
  const sessions = repeatSession(10, { taskId: 't1', durationMinutes: 30 });

  const profile = calculateBreathingProfile({
    sessions, tasks: [task], level: 10, streakDays: 0, today: TODAY,
  });

  it('beast is the top flow', () => {
    expect(profile.ranked[0].key).toBe('beast');
  });
});

describe('calculateBreathingProfile – not enough data', () => {
  it('hasEnoughData = false with fewer than 5 sessions', () => {
    const sessions = repeatSession(4);
    const profile = calculateBreathingProfile({ sessions, tasks: [], level: 5, streakDays: 0, today: TODAY });
    expect(profile.hasEnoughData).toBe(false);
  });

  it('hasEnoughData = true with exactly 5 sessions', () => {
    const sessions = repeatSession(5);
    const profile = calculateBreathingProfile({ sessions, tasks: [], level: 5, streakDays: 0, today: TODAY });
    expect(profile.hasEnoughData).toBe(true);
  });
});

describe('calculateBreathingProfile – sun unlock at Lv.<50', () => {
  it('sunUnlocked = false below Lv.50 regardless of data', () => {
    const task = { id: 't1', value: 'S', resistance: 1.4, difficulty: 1.0, category: 'focus', name: '學習' };
    const sessions = repeatSession(15, { taskId: 't1', finalXP: 90, durationMinutes: 120 });
    const profile = calculateBreathingProfile({ sessions, tasks: [task], level: 49, streakDays: 60, today: TODAY });
    expect(profile.sunUnlocked).toBe(false);
  });
});

// ─── getBreathingTitle ────────────────────────────────────────────────────────

describe('getBreathingTitle – not enough data', () => {
  it('returns isTraining = true when hasEnoughData = false', () => {
    const profile = { hasEnoughData: false, sessionCount: 3, ranked: [], flows: {}, sunUnlocked: false };
    const result = getBreathingTitle({ level: 5, profile, previousFlow: null });
    expect(result.isTraining).toBe(true);
    expect(result.flow).toBeNull();
  });
});

describe('getBreathingTitle – single flow (strong dominance)', () => {
  it('shows single flow when top1 ≥ 38% and gap ≥ 10%', () => {
    // Construct a profile where flame is 45% and water is 20%
    const flows = {
      flame: { pct: 45, score: 450 }, water: { pct: 20, score: 200 },
      thunder: { pct: 10, score: 100 }, stone: { pct: 8, score: 80 },
      mist: { pct: 7, score: 70 }, wind: { pct: 4, score: 40 },
      beast: { pct: 2, score: 20 }, insect: { pct: 2, score: 20 },
      sound: { pct: 1, score: 10 }, sun: { pct: 1, score: 10 },
    };
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 10, sunUnlocked: false };
    const result  = getBreathingTitle({ level: 5, profile, previousFlow: null });
    expect(result.isDual).toBe(false);
    expect(result.isTraining).toBe(false);
    expect(result.flow).toBe('flame');
    expect(result.displayTitle).toContain('炎之呼吸');
  });
});

describe('getBreathingTitle – dual flow when gap ≤ 12%', () => {
  it('shows dual flow when top2 ≥ 25% and gap ≤ 12%', () => {
    const flows = {
      water: { pct: 36, score: 360 }, flame: { pct: 30, score: 300 },
      thunder: { pct: 10, score: 100 }, stone: { pct: 8, score: 80 },
      mist: { pct: 6, score: 60 }, wind: { pct: 4, score: 40 },
      beast: { pct: 2, score: 20 }, insect: { pct: 2, score: 20 },
      sound: { pct: 1, score: 10 }, sun: { pct: 1, score: 10 },
    };
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 10, sunUnlocked: false };
    const result  = getBreathingTitle({ level: 5, profile, previousFlow: null });
    expect(result.isDual).toBe(true);
    expect(result.flow).toBe('water');
    expect(result.flow2).toBe('flame');
    expect(result.displayTitle).toContain('之呼吸');
  });
});

describe('getBreathingTitle – 全集中修練中 when top1 < 28%', () => {
  it('returns isTraining when no flow dominates', () => {
    const flows = Object.fromEntries(
      Object.keys(BREATHING_FLOWS).map((k, i) => [k, { pct: i === 0 ? 20 : 9, score: 100 }])
    );
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 8, sunUnlocked: false };
    const result  = getBreathingTitle({ level: 5, profile, previousFlow: null });
    expect(result.isTraining).toBe(true);
    expect(result.displayTitle).toBe('全集中修練中');
  });
});

describe('getBreathingTitle – sun cannot be main flow at Lv.<50', () => {
  it('sun is excluded from top position when sunUnlocked = false', () => {
    // Give sun highest raw score; profile says not unlocked
    const flows = {
      sun:    { pct: 50, score: 500 }, flame: { pct: 25, score: 250 },
      water:  { pct: 10, score: 100 }, thunder: { pct: 5, score: 50 },
      stone:  { pct: 3, score: 30 }, mist: { pct: 3, score: 30 },
      wind:   { pct: 2, score: 20 }, beast: { pct: 1, score: 10 },
      insect: { pct: 1, score: 10 }, sound: { pct: 0, score: 0 },
    };
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 10, sunUnlocked: false };
    const result  = getBreathingTitle({ level: 49, profile, previousFlow: null });
    expect(result.flow).not.toBe('sun');
  });
});

describe('getBreathingTitle – sun can be main flow when unlocked at Lv.50+', () => {
  it('sun becomes main flow when sunUnlocked = true and it dominates', () => {
    const flows = {
      sun:    { pct: 45, score: 450 }, flame: { pct: 20, score: 200 },
      water:  { pct: 10, score: 100 }, thunder: { pct: 8, score: 80 },
      stone:  { pct: 7, score: 70 }, mist: { pct: 5, score: 50 },
      wind:   { pct: 2, score: 20 }, beast: { pct: 1, score: 10 },
      insect: { pct: 1, score: 10 }, sound: { pct: 1, score: 10 },
    };
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 20, sunUnlocked: true };
    const result  = getBreathingTitle({ level: 55, profile, previousFlow: null });
    expect(result.flow).toBe('sun');
    expect(result.displayTitle).toContain('日之呼吸');
  });
});

describe('getBreathingTitle – sticky bonus keeps previous flow', () => {
  it('adds +8 pct to previousFlow before comparing', () => {
    // flame at 32%, thunder at 28% → gap = 4 (would be dual without sticky)
    // but if previousFlow = flame, flame becomes 40% → single
    const flows = {
      flame:   { pct: 32, score: 320 }, thunder: { pct: 28, score: 280 },
      water:   { pct: 10, score: 100 }, stone:   { pct: 8, score: 80 },
      mist:    { pct: 7, score: 70 },  wind:    { pct: 6, score: 60 },
      beast:   { pct: 4, score: 40 },  insect:  { pct: 3, score: 30 },
      sound:   { pct: 1, score: 10 },  sun:     { pct: 1, score: 10 },
    };
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 10, sunUnlocked: false };

    // Without sticky: gap = 4, both ≥ 25 → dual
    const dualResult = getBreathingTitle({ level: 10, profile, previousFlow: null });
    expect(dualResult.isDual).toBe(true);

    // With sticky on flame: flame adj = 40%, thunder = 28%, gap = 12 which is right at dual threshold
    // gap 12 <= 12 AND top2 28 >= 25 → still dual... let me test the other direction instead
    // Actually, with sticky flame = 40 and thunder = 28, gap = 12.
    // condition: top1 >= 38 AND gap >= 10 → 40 >= 38 ✓ AND 12 >= 10 ✓ → single
    const stickyResult = getBreathingTitle({ level: 10, profile, previousFlow: 'flame' });
    expect(stickyResult.isDual).toBe(false);
    expect(stickyResult.flow).toBe('flame');
  });
});

describe('getBreathingTitle – displayTitle contains technique', () => {
  it('single flow title includes flow label and technique', () => {
    const flows = {
      water:  { pct: 50, score: 500 }, flame: { pct: 15, score: 150 },
      thunder: { pct: 8, score: 80 }, stone:  { pct: 7, score: 70 },
      mist:   { pct: 6, score: 60 },  wind:   { pct: 5, score: 50 },
      beast:  { pct: 4, score: 40 },  insect: { pct: 3, score: 30 },
      sound:  { pct: 1, score: 10 },  sun:    { pct: 1, score: 10 },
    };
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 10, sunUnlocked: false };
    const result  = getBreathingTitle({ level: 1, profile, previousFlow: null });
    expect(result.displayTitle).toBe('水之呼吸・壹之型・水面切');
  });

  it('dual flow title combines two flow names', () => {
    const flows = {
      water:  { pct: 35, score: 350 }, flame:   { pct: 30, score: 300 },
      thunder: { pct: 10, score: 100 }, stone:  { pct: 8, score: 80 },
      mist:   { pct: 6, score: 60 },   wind:    { pct: 4, score: 40 },
      beast:  { pct: 3, score: 30 },   insect:  { pct: 2, score: 20 },
      sound:  { pct: 1, score: 10 },   sun:     { pct: 1, score: 10 },
    };
    const ranked = Object.entries(flows).map(([k, v]) => ({ key: k, pct: v.pct })).sort((a, b) => b.pct - a.pct);
    const profile = { flows, ranked, hasEnoughData: true, sessionCount: 10, sunUnlocked: false };
    const result  = getBreathingTitle({ level: 1, profile, previousFlow: null });
    expect(result.isDual).toBe(true);
    expect(result.displayTitle).toContain('水炎之呼吸');
  });
});
