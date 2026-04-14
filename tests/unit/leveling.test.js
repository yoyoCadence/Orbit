/**
 * leveling.test.js
 *
 * 測試等級稱號系統。稱號直接顯示在 UI 上，改錯用戶感知明顯。
 */

import { describe, it, expect } from 'vitest';
import {
  getTitle, getDisplayTitle, xpTable,
  TITLE_TEMPLATES,
} from '../../pwa/js/leveling.js';

// ─── getTitle (RPG template, default) ────────────────────────────────────────

describe('getTitle (RPG, default)', () => {
  it('level 1 → 初心者',   () => expect(getTitle(1)).toBe('初心者'));
  it('level 5 → 探索者',   () => expect(getTitle(5)).toBe('探索者'));
  it('level 10 → 修行者',  () => expect(getTitle(10)).toBe('修行者'));
  it('level 15 → 挑戰者',  () => expect(getTitle(15)).toBe('挑戰者'));
  it('level 20 → 勇者',    () => expect(getTitle(20)).toBe('勇者'));
  it('level 25 → 菁英',    () => expect(getTitle(25)).toBe('菁英'));
  it('level 50 → 傳說強者',() => expect(getTitle(50)).toBe('傳說強者'));
  it('level 100 → 超越者', () => expect(getTitle(100)).toBe('超越者'));

  it('boundary: level 4 → 初心者（< 5）', () => {
    expect(getTitle(4)).toBe('初心者');
  });
  it('boundary: level 5 → 探索者（≥ 5）', () => {
    expect(getTitle(5)).toBe('探索者');
  });
});

// ─── getTitle (KNY template) ──────────────────────────────────────────────────

describe('getTitle (KNY 鬼滅之刃 template)', () => {
  it('level 1 → 癸之隊士・Mizunoto', () =>
    expect(getTitle(1, 'kny')).toBe('癸之隊士・Mizunoto'));

  it('level 5 → 壬之隊士・Mizunoe', () =>
    expect(getTitle(5, 'kny')).toBe('壬之隊士・Mizunoe'));

  it('level 75 → 甲之隊士・Kinoe', () =>
    expect(getTitle(75, 'kny')).toBe('甲之隊士・Kinoe'));

  it('level 100 → 柱（Hashira）', () =>
    expect(getTitle(100, 'kny')).toBe('柱（Hashira）'));

  it('level 99 → 甲之隊士・Kinoe（< 100）', () =>
    expect(getTitle(99, 'kny')).toBe('甲之隊士・Kinoe'));
});

// ─── getTitle (Business template) ────────────────────────────────────────────

describe('getTitle (Business 職場菁英 template)', () => {
  it('level 1 → 實習生',       () => expect(getTitle(1,   'business')).toBe('實習生'));
  it('level 30 → 經理',        () => expect(getTitle(30,  'business')).toBe('經理'));
  it('level 100 → 執行長（CEO）', () => expect(getTitle(100, 'business')).toBe('執行長（CEO）'));
});

// ─── getDisplayTitle ──────────────────────────────────────────────────────────

describe('getDisplayTitle', () => {
  it('null user → falls back to RPG level 1 title', () => {
    expect(getDisplayTitle(1, null)).toBe('初心者');
  });

  it('user with no template → uses RPG default', () => {
    expect(getDisplayTitle(5, {})).toBe('探索者');
  });

  it('user.customTitle overrides template', () => {
    const user = { customTitle: '天才少年', titleTemplate: 'kny' };
    expect(getDisplayTitle(1, user)).toBe('天才少年');
  });

  it('empty customTitle falls back to template', () => {
    const user = { customTitle: '', titleTemplate: 'kny' };
    expect(getDisplayTitle(1, user)).toBe('癸之隊士・Mizunoto');
  });

  it('user.titleTemplate = kny → KNY title', () => {
    const user = { titleTemplate: 'kny' };
    expect(getDisplayTitle(100, user)).toBe('柱（Hashira）');
  });

  it('user.titleTemplate = business → business title', () => {
    const user = { titleTemplate: 'business' };
    expect(getDisplayTitle(100, user)).toBe('執行長（CEO）');
  });
});

// ─── TITLE_TEMPLATES structure ────────────────────────────────────────────────

describe('TITLE_TEMPLATES', () => {
  it('has rpg, kny, business keys', () => {
    expect(Object.keys(TITLE_TEMPLATES)).toEqual(expect.arrayContaining(['rpg', 'kny', 'business']));
  });

  it('each template has name, icon, tiers', () => {
    Object.values(TITLE_TEMPLATES).forEach(tmpl => {
      expect(tmpl).toHaveProperty('name');
      expect(tmpl).toHaveProperty('icon');
      expect(Array.isArray(tmpl.tiers)).toBe(true);
      expect(tmpl.tiers.length).toBeGreaterThanOrEqual(5);
    });
  });

  it('tiers are sorted descending by level threshold', () => {
    Object.values(TITLE_TEMPLATES).forEach(tmpl => {
      for (let i = 1; i < tmpl.tiers.length; i++) {
        expect(tmpl.tiers[i][0]).toBeLessThan(tmpl.tiers[i - 1][0]);
      }
    });
  });
});

// ─── xpTable ─────────────────────────────────────────────────────────────────

describe('xpTable', () => {
  it('returns count rows', () => {
    const rows = xpTable(1, 5);
    expect(rows).toHaveLength(5);
  });

  it('first row starts at fromLevel', () => {
    const rows = xpTable(3, 3);
    expect(rows[0].from).toBe(3);
    expect(rows[0].to).toBe(4);
  });

  it('each row has positive xp', () => {
    xpTable(1, 10).forEach(row => {
      expect(row.xp).toBeGreaterThan(0);
    });
  });

  it('xp increases per level', () => {
    const rows = xpTable(1, 5);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].xp).toBeGreaterThan(rows[i - 1].xp);
    }
  });
});
