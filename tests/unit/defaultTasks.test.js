/**
 * defaultTasks.test.js
 *
 * 驗證預設任務模板的結構完整性。
 * 這些任務在普通模式下不可編輯（isDefault:true 是鎖定機制的關鍵）。
 */

import { describe, it, expect, vi } from 'vitest';

// ─── mock uid / utils（不依賴 Date.now randomness） ──────────────────────────
vi.mock('../../pwa/js/utils.js', () => ({
  uid: () => 'mock-uid-' + Math.random().toString(36).slice(2, 8),
}));

import { createDefaultTasks } from '../../pwa/js/defaultTasks.js';

describe('createDefaultTasks()', () => {
  const tasks = createDefaultTasks();

  it('returns 13 default tasks', () => {
    expect(tasks).toHaveLength(13);
  });

  it('every task has isDefault: true', () => {
    tasks.forEach(t => {
      expect(t.isDefault).toBe(true);
    });
  });

  it('every task has required shape fields', () => {
    const required = ['id','name','category','impactType','taskNature','value','difficulty','resistance','emoji'];
    tasks.forEach(t => {
      required.forEach(field => {
        expect(t).toHaveProperty(field);
      });
    });
  });

  it('growth tasks have value S or A', () => {
    tasks
      .filter(t => t.taskNature === 'growth')
      .forEach(t => {
        expect(['S', 'A']).toContain(t.value);
      });
  });

  it('entertainment / recovery tasks have value D', () => {
    tasks
      .filter(t => t.impactType === 'recovery' || t.impactType === 'entertainment')
      .forEach(t => {
        expect(t.value).toBe('D');
      });
  });

  it('focus tasks have minEffectiveMinutes > 0', () => {
    tasks
      .filter(t => t.category === 'focus')
      .forEach(t => {
        expect(t.minEffectiveMinutes).toBeGreaterThan(0);
      });
  });

  it('instant tasks have minEffectiveMinutes === 0', () => {
    tasks
      .filter(t => t.category === 'instant')
      .forEach(t => {
        expect(t.minEffectiveMinutes).toBe(0);
      });
  });
});
