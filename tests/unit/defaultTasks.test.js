/**
 * defaultTasks.test.js
 *
 * 驗證預設任務模板的結構完整性。
 * 這些任務在普通模式下不可編輯（isDefault:true 是鎖定機制的關鍵）。
 */

import { afterEach, describe, it, expect, vi } from 'vitest';

// ─── mock uid / utils（不依賴 Date.now randomness） ──────────────────────────
vi.mock('../../pwa/js/utils.js', async importOriginal => ({
  ...(await importOriginal()),
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

describe('createDefaultTasks() dates (BUG-125)', () => {
  const zoneBefore = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    if (zoneBefore === undefined) delete process.env.TZ;
    else process.env.TZ = zoneBefore;
  });

  it('dates the tasks by the local date, as the S-task daily limit counts them', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 2026-04-10 17:30 UTC: the 11th in Taipei, still the 10th in Los Angeles.
    vi.setSystemTime(new Date('2026-04-10T17:30:00Z'));
    for (const [zone, date] of [['Asia/Taipei', '2026-04-11'], ['America/Los_Angeles', '2026-04-10']]) {
      process.env.TZ = zone;
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
      expect(new Set(createDefaultTasks().map(t => t.createdAt)), zone).toEqual(new Set([date]));
    }
  });
});
