/**
 * @vitest-environment jsdom
 */
/**
 * pro014rClientDecisions.test.js — PRO-014R：014 的 `my_pro_status()` 回應交給 client 後的判讀。
 *
 * client 把 `expires_at` 與 `trial_ends_at` 中較晚的一個當成 Pro 的上限，並用「還有什麼能解釋
 * 這個 active」推斷付費或試用。014 只在試用還能延長付費以外的存取時才回報 `trial_ends_at`，
 * 因此 client 不需改邏輯，推斷也變得精確。這裡以 014 對每個情境的回應為 fixture（對應
 * tests/database/pro014r.test.sql 的情境），鎖住 client 的判讀。情境 14 在 SQL 中差 1 微秒，
 * 而 `Date.parse` 只到毫秒：fixture 用 1ms 表示「付費比試用早結束」，實際送到 client 時兩個
 * 時間戳常常相等，另有一個測試涵蓋相等的情況。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyProStatusResponse,
  getPaidProStateFromSnapshot,
  getTrialEndsAtFromSnapshot,
  isProFromSnapshot,
  resetProEntitlementStorageState,
} from '../../pwa/js/platform/proEntitlement.js';

const OWNER = 'owner-1';
const NOW = Date.parse('2026-11-01T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TRIAL = 15 * DAY;
const iso = ms => (ms === null ? null : new Date(ms).toISOString());

function judge(row, atMs) {
  localStorage.clear();
  resetProEntitlementStorageState();
  applyProStatusResponse({ ownerId: OWNER, rows: [row], nowMs: NOW });
  if (!isProFromSnapshot(OWNER, atMs)) return { kind: 'none', countdown: false };
  const paid = getPaidProStateFromSnapshot(OWNER, atMs);
  const kind = paid.isPaid ? (paid.expiresAt ? 'paid' : 'lifetime') : 'trial';
  return { kind, countdown: getTrialEndsAtFromSnapshot(OWNER, atMs) !== null };
}

// [情境, 014 的回應 (is_active, expires_at, trial_ends_at), 取得時的判讀, 3 小時後的判讀]
const cases = [
  ['1 免費，從未試用',              [false, null, null],                                 'none',     'none'],
  ['2 試用中',                      [true, null, NOW - DAY + TRIAL],                    'trial',    'trial'],
  ['3 免費，試用已過期',            [false, null, NOW - 60 * DAY + TRIAL],              'none',     'none'],
  ['4 付費 30 天後到期，試用已過期', [true, NOW + 30 * DAY, null],                       'paid',     'paid'],
  ['5 終身，試用已過期（PRO-014R）', [true, null, null],                                 'lifetime', 'lifetime'],
  ['6 終身，從未試用',              [true, null, null],                                 'lifetime', 'lifetime'],
  ['7 試用期間買了終身（PRO-014N）', [true, null, null],                                 'lifetime', 'lifetime'],
  ['8 試用期間買了 30 天方案',      [true, NOW + 30 * DAY, null],                       'paid',     'paid'],
  ['9 付費已過期，試用已過期',      [false, NOW - DAY, null],                           'none',     'none'],
  ['10 付費已過期，試用中',         [true, NOW - DAY, NOW - DAY + TRIAL],               'trial',    'trial'],
  ['11 付費 2 小時後到期，試用中',  [true, NOW + 2 * HOUR, NOW - DAY + TRIAL],          'paid',     'trial'],
  ['12 試用開始時間在未來',         [false, null, null],                                 'none',     'none'],
  ['13 付費剛好在試用結束時到期',   [true, NOW - DAY + TRIAL, null],                    'paid',     'paid'],
  ['14 付費比試用早 1ms 到期',      [true, NOW - DAY + TRIAL - 1, NOW - DAY + TRIAL],   'paid',     'paid'],
  ['15 沒有付費但有到期日',         [false, null, NOW - 60 * DAY + TRIAL],              'none',     'none'],
];

beforeEach(() => {
  localStorage.clear();
  resetProEntitlementStorageState();
});

describe('PRO-014R：client 對 014 回應的判讀', () => {
  it.each(cases)('%s', (_label, [active, expiresAt, trialEndsAt], atFetch, after3h) => {
    const row = { is_active: active, expires_at: iso(expiresAt), trial_ends_at: iso(trialEndsAt) };
    expect(judge(row, NOW).kind).toBe(atFetch);
    expect(judge(row, NOW + 3 * HOUR).kind).toBe(after3h);
  });

  it('付費使用者沒有試用倒數；只有試用是存取原因時才有', () => {
    const countdown = ([active, expiresAt, trialEndsAt]) => judge(
      { is_active: active, expires_at: iso(expiresAt), trial_ends_at: iso(trialEndsAt) },
      NOW,
    ).countdown;
    const withCountdown = cases.filter(([, row]) => countdown(row)).map(([label]) => label.split(' ')[0]);
    // 2、10：試用是存取原因；11、14：付費比試用早結束，試用之後接手。
    expect(withCountdown).toEqual(['2', '10', '11', '14']);
  });

  it('情境 14 實際送到 client 時兩個時間戳相等（毫秒精度）：仍判為付費，並有試用倒數', () => {
    const t = iso(NOW - DAY + TRIAL);
    const row = { is_active: true, expires_at: t, trial_ends_at: t };
    expect(judge(row, NOW)).toEqual({ kind: 'paid', countdown: true });
  });

  it('client 本身照舊以回應中的日期為上限：011 對終身帳號回報過期的試用日時仍會拒絕（這正是 014 在 server 端修正的）', () => {
    const row011 = { is_active: true, expires_at: null, trial_ends_at: iso(NOW - 45 * DAY) };
    expect(judge(row011, NOW).kind).toBe('none');
  });
});
