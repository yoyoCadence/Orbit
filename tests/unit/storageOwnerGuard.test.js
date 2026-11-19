// @vitest-environment jsdom
/**
 * HW-112D (b): a window still holding account A while another tab switched the
 * stored account to B must not write A's sessions, tasks or energy under B
 * (saveSessions would also insert A's new sessions into B's account).
 * Real storage.js; the Supabase client is a spy signed in as B (auth is shared
 * between tabs), so an insert that got through would be seen.
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const calls = vi.hoisted(() => []);
vi.mock('../../pwa/js/supabase.js', () => {
  const table = name => {
    const chain = {
      insert: row => { calls.push({ table: name, op: 'insert', row }); return Promise.resolve({ error: null }); },
      upsert: row => { calls.push({ table: name, op: 'upsert', row }); return Promise.resolve({ error: null }); },
      delete: () => chain,
      eq: () => chain,
      in: () => Promise.resolve({ error: null }),
      then: resolve => resolve({ error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: B } } } }) },
      from: table,
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

import { storage } from '../../pwa/js/storage.js';

const read = key => JSON.parse(localStorage.getItem(`yoyo_${key}`));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const session = id => ({ id, taskId: 't1', taskName: 'Deep Work', date: '2026-11-19', finalXP: 10 });

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Another tab signed in as B: B's user and sessions are stored.
  localStorage.setItem('yoyo_user', JSON.stringify({ id: B, name: 'B' }));
  localStorage.setItem('yoyo_sessions', JSON.stringify([session('b-1')]));
  localStorage.setItem('yoyo_tasks', JSON.stringify([{ id: 'b-task' }]));
  localStorage.setItem('yoyo_energy', JSON.stringify({ currentEnergy: 50, maxEnergy: 100 }));
});

describe('a window still holding another account', () => {
  it('saveSessions writes nothing and inserts nothing under the stored account', async () => {
    expect(storage.saveSessions([session('a-1'), session('a-2')], A)).toBe(false);
    await flush();
    expect(read('sessions')).toEqual([session('b-1')]);
    expect(localStorage.getItem(`yoyo_sessionSyncPending:${encodeURIComponent(B)}`)).toBeNull();
    expect(calls).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('another window switched the stored account'));
  });

  it('saveTasks and saveEnergy write nothing either, and the page is told', async () => {
    const told = vi.fn();
    window.addEventListener('orbit:stored-account-changed', told);
    expect(storage.saveTasks([{ id: 'a-task' }], A)).toBe(false);
    expect(storage.saveEnergy({ currentEnergy: 90, maxEnergy: 100 }, A)).toBe(false);
    await flush();
    expect(read('tasks')).toEqual([{ id: 'b-task' }]);
    expect(read('energy')).toEqual({ currentEnergy: 50, maxEnergy: 100 });
    expect(calls).toEqual([]);
    expect(told).toHaveBeenCalledTimes(2);
    window.removeEventListener('orbit:stored-account-changed', told);
    // app.js listens for the same name (storage.js does not export it: INFRA-105).
    const source = path => readFileSync(`pwa/js/${path}`, 'utf8'); // run from the repository root
    expect(source('storage.js')).toContain("const STORED_ACCOUNT_CHANGED_EVENT = 'orbit:stored-account-changed';");
    expect(source('app.js')).toContain("window.addEventListener('orbit:stored-account-changed',");
  });

  it('a guest window (no account) does not write over a stored account, nor an account window over none', () => {
    expect(storage.saveSessions([session('g-1')], null)).toBe(false);
    localStorage.removeItem('yoyo_user');
    expect(storage.saveTasks([{ id: 'a-task' }], A)).toBe(false);
    expect(read('tasks')).toEqual([{ id: 'b-task' }]);
  });
});

describe('the stored account\'s own window', () => {
  it('saves and syncs as before', async () => {
    expect(storage.saveSessions([session('b-1'), session('b-2')], B)).toBe(true);
    await flush();
    expect(read('sessions').map(s => s.id)).toEqual(['b-1', 'b-2']);
    expect(calls.filter(call => call.table === 'sessions')).toEqual([
      { table: 'sessions', op: 'insert', row: expect.objectContaining({ user_id: B, id: 'b-2' }) },
    ]);
    expect(storage.saveTasks([{ id: 'b-task-2' }], B)).toBe(true);
    expect(storage.saveEnergy({ currentEnergy: 70, maxEnergy: 100 }, B)).toBe(true);
    expect(read('energy').currentEnergy).toBe(70);
  });

  it('a guest with no stored account saves locally', () => {
    localStorage.removeItem('yoyo_user');
    expect(storage.saveSessions([session('g-1')], null)).toBe(true);
    expect(read('sessions').map(s => s.id)).toEqual(['g-1']);
  });

  it('a caller that names no owner keeps the old behaviour', () => {
    expect(storage.saveSessions([session('x-1')])).toBe(true);
    expect(read('sessions').map(s => s.id)).toEqual(['x-1']);
  });
});
