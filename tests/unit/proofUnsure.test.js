// @vitest-environment jsdom
/**
 * HW-112D (a): the photos BUG-118's "check sync" can only name apart, because
 * waiting will not change them (the sync is done with them, yet they are not
 * surely in the cloud), and the sheet that shows them to save by hand.
 * Uses the real proofSync.js and proofLocal.js, so the backfill marker and the
 * "surely uploaded" test are the ones the app uses.
 */

/* global btoa, KeyboardEvent -- jsdom provides them */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = '11111111-1111-4111-8111-111111111111';
const sid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

const auth = vi.hoisted(() => ({ userId: null }));
const local = vi.hoisted(() => ({ user: null, sessions: [] }));
const mockUpload = vi.hoisted(() => vi.fn());

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: auth.userId ? { user: { id: auth.userId } } : null } })) },
    storage: { from: vi.fn(() => ({ upload: mockUpload, remove: vi.fn(async () => ({ data: [], error: null })), list: vi.fn() })) },
  },
}));
vi.mock('../../pwa/js/storage.js', () => ({
  storage: { getUser: () => local.user, getSessions: () => local.sessions },
}));
vi.mock('../../pwa/js/platform/sessionDeletionLog.js', () => ({ getDeletedSessionIds: () => [] }));
vi.mock('../../pwa/js/platform/proofCloud.js', () => ({ clearCloudProofs: vi.fn(async () => {}) }));

import { flushProofSync, queueProofUpload } from '../../pwa/js/platform/proofSync.js';
import { photosNotSurelyUploaded } from '../../pwa/js/platform/proofLocal.js';
import { saveProof } from '../../pwa/js/platform/proofStore.js';
import { unsureProofPhotos } from '../../pwa/js/platform/proofUnsure.js';
import { closeProofKeepSheet, showProofKeepSheet } from '../../pwa/js/ui/proofKeepSheet.js';
import { statusBarSyncCheckText } from '../../pwa/js/statusBarNotice.js';

const jpeg = (bytes = 8) => `data:image/jpeg;base64,${btoa('\xff\xd8\xff' + 'x'.repeat(bytes))}`;
const png = 'data:image/png;base64,iVBORw0KGgo=';

function signIn(...rows) {
  auth.userId = OWNER;
  local.user = { id: OWNER };
  local.sessions = rows;
}

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  vi.clearAllMocks();
  auth.userId = null;
  local.user = null;
  local.sessions = [];
  mockUpload.mockResolvedValue({ data: {}, error: null });
});

describe('unsureProofPhotos', () => {
  it('says nothing before the first sync queued the account\'s photos (they are still waiting)', () => {
    signIn({ id: sid(1) });
    saveProof(sid(1), png);
    expect(unsureProofPhotos(OWNER, local.sessions)).toEqual([]);
    expect(photosNotSurelyUploaded(OWNER, local.sessions)).toBe(1);
  });

  it('names the photos the sync is done with but could not surely send; not sent or waiting ones', async () => {
    signIn(
      { id: sid(1), date: '2026-03-01', taskName: '跑步' }, // JPEG: sent
      { id: sid(2), date: '2026-03-02', taskName: '閱讀' }, // waiting (offline)
      { id: sid(3), date: '2026-03-03', taskName: '冥想' }, // older PNG: no re-encode here, skipped
      { id: sid(4), date: '2026-03-04', taskName: '寫作' }, // over 200 KB: skipped
      { id: sid(5), date: '2026-03-05', taskName: '沒照片' },
    );
    saveProof(sid(1), jpeg());
    saveProof(sid(3), png);
    saveProof(sid(4), jpeg(210 * 1024));
    await flushProofSync(OWNER);
    // A photo saved since, while offline: queued, waiting.
    saveProof(sid(2), jpeg());
    queueProofUpload(OWNER, sid(2));
    mockUpload.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await flushProofSync(OWNER);
    expect(unsureProofPhotos(OWNER, local.sessions)).toEqual([
      { sessionId: sid(4), date: '2026-03-04', taskName: '寫作' },
      { sessionId: sid(3), date: '2026-03-03', taskName: '冥想' },
    ]);
    // Never more than "not surely uploaded", which also counts the waiting one.
    expect(photosNotSurelyUploaded(OWNER, local.sessions)).toBe(3);
  });

  it('a session id the bucket would refuse never uploads: named once the backfill ran', async () => {
    signIn({ id: sid(1) }, { id: 'legacy-session', date: '2025-12-31', taskName: '舊紀錄' }, { id: 'legacy-session' });
    saveProof('legacy-session', jpeg());
    await flushProofSync(OWNER);
    expect(unsureProofPhotos(OWNER, local.sessions)).toEqual([
      { sessionId: 'legacy-session', date: '2025-12-31', taskName: '舊紀錄' },
    ]);
  });

  it('nothing without an account or sessions', () => {
    expect(unsureProofPhotos(null, [{ id: sid(1) }])).toEqual([]);
    expect(unsureProofPhotos(OWNER, null)).toEqual([]);
  });
});

describe('statusBarSyncCheckText with photos waiting will not change', () => {
  it('only those left: not "can go", but how to keep them', () => {
    const check = statusBarSyncCheckText({ online: true, pending: 0, photos: 2, unsure: 2 });
    expect(check.ok).toBe(false);
    expect(check.text).toContain('資料都同步了，但有 2 張佐證照片無法確認已上傳');
    expect(check.text).toContain('再等也不會改變');
    expect(check.text).toContain('查看這 2 張照片');
    expect(check.text).not.toContain('還沒上傳，先不要');
  });

  it('counts the waiting ones apart from them', () => {
    const check = statusBarSyncCheckText({ online: true, pending: 1, photos: 3, unsure: 1 });
    expect(check.text).toContain('還有 1 筆資料還沒同步、2 張佐證照片還沒上傳，先不要移除舊圖示');
    expect(check.text).toContain('另有 1 張佐證照片無法確認已上傳');
    const offline = statusBarSyncCheckText({ online: false, pending: 0, photos: 1, unsure: 1 });
    expect(offline).toEqual({ ok: false, text: expect.stringContaining('目前離線：連上網路後再按一次。另有 1 張'), unsure: 1 });
  });

  it('never names more than the photos counted (an older caller passes no count)', () => {
    const capped = statusBarSyncCheckText({ online: true, pending: 0, photos: 1, unsure: 5 });
    expect(capped.text).toContain('有 1 張');
    expect(capped.unsure).toBe(1); // the page offers that many, not more
    expect(statusBarSyncCheckText({ online: true, pending: 0, photos: 2 }).unsure).toBe(0);
    expect(statusBarSyncCheckText({ online: true, pending: 0, photos: 2 }).text).toContain('還有 2 張佐證照片還沒上傳');
  });
});

describe('showProofKeepSheet', () => {
  it('shows each photo on this device with its day and task, as text', () => {
    saveProof(sid(1), jpeg());
    saveProof(sid(2), png);
    const overlay = showProofKeepSheet([
      { sessionId: sid(1), date: '2026-03-04', taskName: '<img src=x onerror=alert(1)>' },
      { sessionId: sid(2), date: '', taskName: '' },
      { sessionId: sid(3), date: '2026-03-05', taskName: '沒照片' },
    ]);
    expect(overlay.classList.contains('proof-lightbox')).toBe(true); // the Orbit Window pauses under it
    expect(overlay.getAttribute('role')).toBe('dialog');
    const images = overlay.querySelectorAll('.proof-keep-list img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe(jpeg());
    const captions = [...overlay.querySelectorAll('figcaption')].map(node => node.textContent);
    expect(captions).toEqual(['2026/3/4 <img src=x onerror=alert(1)>', '這筆任務']);
    expect(overlay.querySelectorAll('figcaption img')).toHaveLength(0);
    // Other data may still be waiting: the sheet never says the old icon can go
    // by itself (#261 Codex P2).
    const hint = overlay.querySelector('.proof-keep-hint').textContent;
    expect(hint).toContain('再按一次「檢查同步」');
    expect(hint).not.toMatch(/存好後，就可以移除/);
    expect(document.activeElement?.className).toBe('proof-keep-close');
  });

  it('closes with its button or Escape, and gives focus back', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    showProofKeepSheet([], { returnFocus: opener });
    document.querySelector('.proof-keep-close').click();
    expect(document.querySelector('.proof-keep-sheet')).toBeNull();
    expect(document.activeElement).toBe(opener);

    showProofKeepSheet([], { returnFocus: opener });
    showProofKeepSheet([], { returnFocus: opener }); // a second press replaces the first
    expect(document.querySelectorAll('.proof-keep-sheet')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.proof-keep-sheet')).toBeNull();
  });

  it('closes for sign-out without moving focus (#261 Codex P2)', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    showProofKeepSheet([], { returnFocus: opener });
    closeProofKeepSheet();
    expect(document.querySelector('.proof-keep-sheet')).toBeNull();
    expect(document.activeElement).not.toBe(opener);
    closeProofKeepSheet(); // nothing open: nothing happens
  });
});
