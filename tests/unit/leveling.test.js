/**
 * leveling.test.js
 *
 * 測試等級稱號系統。稱號直接顯示在 UI 上，改錯用戶感知明顯。
 */

import { describe, it, expect } from 'vitest';
import {
  getTitle, getDisplayTitle, xpTable,
  getAllTemplates, TITLE_TEMPLATES,
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

// ─── getAllTemplates ──────────────────────────────────────────────────────────

describe('getAllTemplates', () => {
  it('no custom → returns all 3 built-in keys', () => {
    const all = getAllTemplates();
    expect(Object.keys(all)).toEqual(expect.arrayContaining(['rpg', 'kny', 'business']));
    expect(Object.keys(all)).toHaveLength(3);
  });

  it('custom templates are merged in', () => {
    const custom = {
      myTheme: { name: '我的主題', icon: '🌟', tiers: [[1, '新手']] },
    };
    const all = getAllTemplates(custom);
    expect(all).toHaveProperty('myTheme');
    expect(Object.keys(all)).toHaveLength(4);
  });

  it('custom key overrides built-in key with same name', () => {
    const custom = {
      rpg: { name: '自訂RPG', icon: '🗡️', tiers: [[1, '覆蓋稱號']] },
    };
    const all = getAllTemplates(custom);
    expect(all.rpg.name).toBe('自訂RPG');
    // total count stays 3 (override, not add)
    expect(Object.keys(all)).toHaveLength(3);
  });

  it('built-in templates are not mutated', () => {
    getAllTemplates({ rpg: { name: 'X', icon: '?', tiers: [] } });
    expect(TITLE_TEMPLATES.rpg.name).toBe('RPG 冒險者');
  });
});

// ─── getTitle with custom templates ──────────────────────────────────────────

describe('getTitle with custom templates (3rd param)', () => {
  const customTemplates = {
    hero: {
      name: '英雄',
      icon: '🦸',
      tiers: [
        [50, '超級英雄'],
        [10, '英雄'],
        [1,  '見習英雄'],
      ],
    },
  };

  it('uses custom template when key matches', () => {
    expect(getTitle(1, 'hero', customTemplates)).toBe('見習英雄');
    expect(getTitle(10, 'hero', customTemplates)).toBe('英雄');
    expect(getTitle(50, 'hero', customTemplates)).toBe('超級英雄');
  });

  it('unknown key falls back to rpg template', () => {
    expect(getTitle(1, 'nonexistent', customTemplates)).toBe('初心者');
  });

  it('level between tiers uses the correct lower bound', () => {
    // level 30 → still '英雄' (≥10 but <50)
    expect(getTitle(30, 'hero', customTemplates)).toBe('英雄');
  });
});

// ─── getDisplayTitle with customTemplates ────────────────────────────────────

describe('getDisplayTitle with user.customTemplates', () => {
  it('uses custom template title when user.titleTemplate points to custom key', () => {
    const user = {
      titleTemplate: 'hero',
      customTitle: '',
      customTemplates: {
        hero: {
          name: '英雄',
          icon: '🦸',
          tiers: [[1, '見習英雄']],
        },
      },
    };
    expect(getDisplayTitle(1, user)).toBe('見習英雄');
  });

  it('customTitle still takes priority over custom template', () => {
    const user = {
      titleTemplate: 'hero',
      customTitle: '蓋過一切',
      customTemplates: {
        hero: { name: '英雄', icon: '🦸', tiers: [[1, '見習英雄']] },
      },
    };
    expect(getDisplayTitle(1, user)).toBe('蓋過一切');
  });

  it('user with no customTemplates field still works', () => {
    const user = { titleTemplate: 'rpg' };
    expect(getDisplayTitle(5, user)).toBe('探索者');
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
