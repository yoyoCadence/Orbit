/**
 * leveling.test.js
 *
 * 測試等級稱號系統。稱號直接顯示在 UI 上，改錯用戶感知明顯。
 */

import { describe, it, expect } from 'vitest';
import { getTitle, xpTable } from '../../pwa/js/leveling.js';

describe('getTitle', () => {
  it('level 1 → 初心者', () => expect(getTitle(1)).toBe('初心者'));
  it('level 5 → 探索者', () => expect(getTitle(5)).toBe('探索者'));
  it('level 10 → 修行者', () => expect(getTitle(10)).toBe('修行者'));
  it('level 15 → 挑戰者', () => expect(getTitle(15)).toBe('挑戰者'));
  it('level 20 → 勇者', () => expect(getTitle(20)).toBe('勇者'));
  it('level 25 → 菁英', () => expect(getTitle(25)).toBe('菁英'));
  it('level 50 → 傳說強者', () => expect(getTitle(50)).toBe('傳說強者'));
  it('level 100 → 超越者', () => expect(getTitle(100)).toBe('超越者'));

  it('boundary: level 4 → 初心者（< 5）', () => {
    expect(getTitle(4)).toBe('初心者');
  });
  it('boundary: level 5 → 探索者（≥ 5）', () => {
    expect(getTitle(5)).toBe('探索者');
  });
});

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
