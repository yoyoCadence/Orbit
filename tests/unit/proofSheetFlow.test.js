// @vitest-environment jsdom
/**
 * proofSheetFlow.test.js — TEST-008: the proof-photo sheet and the full-screen
 * photo (pwa/js/ui/proofSheet.js). Choosing a photo, its preview, saving it on
 * this device and, for a signed-in account, queuing the cloud copy
 * (HW-112C1), the thumbnail put into the session's row without a re-render,
 * and closing. The photo pipeline and the row's controls are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  saveProof: vi.fn(),
  proofSaved: vi.fn(),
  hasStoredSession: vi.fn(() => true),
  compressImage: vi.fn(),
  bindProofThumbs: vi.fn(),
  proofControlsHtml: vi.fn(sessionId => `<span class="session-proof-thumb-wrap" data-session-id="${sessionId}"></span>`),
  state: { user: { id: 'u1' } },
}));

vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: mocks.showToast }));
vi.mock('../../pwa/js/platform/proofStore.js', () => ({ saveProof: mocks.saveProof }));
vi.mock('../../pwa/js/platform/proofSync.js', () => ({ proofSaved: mocks.proofSaved }));
vi.mock('../../pwa/js/sessionPresence.js', () => ({ hasStoredSession: mocks.hasStoredSession }));
vi.mock('../../pwa/js/state.js', () => ({ state: mocks.state }));
vi.mock('../../pwa/js/ui/sessionRow.js', () => ({
  bindProofThumbs: mocks.bindProofThumbs,
  proofControlsHtml: mocks.proofControlsHtml,
}));
vi.mock('../../pwa/js/platform/proofCapture.js', () => ({ compressImage: mocks.compressImage }));

const { showProofLightbox, showProofSheet } = await import('../../pwa/js/ui/proofSheet.js');

const PHOTO = 'data:image/jpeg;base64,AAAA';
const sheet = () => document.querySelector('.pro-sheet');
const overlay = () => document.querySelector('.pro-sheet-overlay');

/** The session's row in the log, as the home page renders it. */
function logRow(sessionId, extra = '') {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="log-item">
      <span class="log-name">寫報告</span>${extra}
      <span class="log-xp">+30 XP</span>
      <button class="session-del-btn" data-session-id="${sessionId}"></button>
    </div>`);
  return document.body.lastElementChild;
}

async function choose(file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })) {
  const input = sheet().querySelector('#proof-file-input');
  Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(mocks.compressImage.mock.calls.length + (file ? 0 : 1)).toBeGreaterThan(0));
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  mocks.state.user = { id: 'u1' };
  mocks.hasStoredSession.mockReturnValue(true);
  mocks.compressImage.mockResolvedValue(PHOTO);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('full-screen photo', () => {
  it('shows the photo over everything, and fades out on a tap', () => {
    vi.useFakeTimers();
    showProofLightbox(PHOTO);
    const lightbox = document.querySelector('.proof-lightbox');
    // PS-249A finds full-screen overlays by this class.
    expect(lightbox.style.position).toBe('fixed');
    const image = lightbox.querySelector('img');
    expect(image.getAttribute('src')).toBe(PHOTO);
    expect(image.alt).toBe('佐證');
    lightbox.click();
    expect(lightbox.style.animation).toContain('proFadeOut');
    expect(document.querySelector('.proof-lightbox')).not.toBe(null);
    vi.advanceTimersByTime(200);
    expect(document.querySelector('.proof-lightbox')).toBe(null);
    // Kept on window for the rows' inline-free handlers.
    expect(window._showProofLightbox).toBe(showProofLightbox);
  });
});

describe('proof sheet', () => {
  it('opens with the task name as text and nothing to confirm yet', async () => {
    await showProofSheet('s1', '<b>寫報告</b>');
    expect(sheet().querySelector('#proof-task-name').textContent).toBe('<b>寫報告</b>');
    expect(sheet().querySelector('#proof-task-name b')).toBe(null);
    expect(sheet().querySelector('#proof-confirm').disabled).toBe(true);
    expect(sheet().querySelector('#proof-preview').style.display).toBe('none');
    // Anchored at the bottom even where a theme makes sheets relative.
    expect(sheet().style.position).toBe('fixed');
  });

  it('previews the chosen photo, compressed, and allows confirming it', async () => {
    await showProofSheet('s1', '寫報告');
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    await choose(file);
    expect(mocks.compressImage).toHaveBeenCalledWith(file);
    expect(sheet().querySelector('#proof-img').getAttribute('src')).toBe(PHOTO);
    expect(sheet().querySelector('#proof-preview').style.display).toBe('block');
    expect(sheet().querySelector('#proof-confirm').disabled).toBe(false);
  });

  it('says so when the photo cannot be processed, and keeps nothing to confirm', async () => {
    mocks.compressImage.mockRejectedValue(new Error('decode'));
    await showProofSheet('s1', '寫報告');
    await choose();
    expect(mocks.showToast).toHaveBeenCalledWith('圖片處理失敗');
    expect(sheet().querySelector('#proof-confirm').disabled).toBe(true);
    // Confirm does nothing without a photo, even if the button were enabled.
    sheet().querySelector('#proof-confirm').disabled = false;
    sheet().querySelector('#proof-confirm').click();
    expect(mocks.saveProof).not.toHaveBeenCalled();
  });

  it('ignores a cancelled file picker', async () => {
    await showProofSheet('s1', '寫報告');
    const input = sheet().querySelector('#proof-file-input');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(mocks.compressImage).not.toHaveBeenCalled();
    expect(sheet().querySelector('#proof-confirm').disabled).toBe(true);
  });

  it('saves the photo here, queues the cloud copy for a signed-in account, and closes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    await showProofSheet('s1', '寫報告');
    await choose();
    sheet().querySelector('#proof-confirm').click();
    expect(mocks.saveProof).toHaveBeenCalledWith('s1', PHOTO);
    expect(mocks.proofSaved).toHaveBeenCalledWith('u1', 's1');
    expect(mocks.showToast).toHaveBeenCalledWith('佐證已儲存');
    // It slides away, then leaves the page.
    expect(sheet().classList.contains('pro-sheet-out')).toBe(true);
    expect(overlay().classList.contains('pro-sheet-overlay-out')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(sheet()).toBe(null);
    expect(overlay()).toBe(null);
  });

  it('keeps a guest\'s photo on this device only, and a signed-out account\'s too', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    mocks.state.user = { name: 'guest' };
    await showProofSheet('s1', '寫報告');
    await choose();
    sheet().querySelector('#proof-confirm').click();
    // The first sheet has slid away before the next one opens.
    vi.advanceTimersByTime(300);
    mocks.state.user = { id: 'u1' };
    mocks.hasStoredSession.mockReturnValue(false);
    await showProofSheet('s2', '寫報告');
    await choose();
    sheet().querySelector('#proof-confirm').click();
    expect(mocks.saveProof.mock.calls).toEqual([['s1', PHOTO], ['s2', PHOTO]]);
    expect(mocks.proofSaved).not.toHaveBeenCalled();
  });

  it('puts the thumbnail into the session\'s row, before its XP, in place of a cloud placeholder', async () => {
    const row = logRow('s1', '<span class="session-proof-cloud"></span>');
    await showProofSheet('s1', '寫報告');
    await choose();
    sheet().querySelector('#proof-confirm').click();
    expect(row.querySelector('.session-proof-cloud')).toBe(null);
    const thumb = row.querySelector('.session-proof-thumb-wrap');
    expect(thumb.dataset.sessionId).toBe('s1');
    expect(thumb.nextElementSibling.classList.contains('log-xp')).toBe(true);
    expect(mocks.proofControlsHtml).toHaveBeenCalledWith('s1', { ownerId: 'u1', taskName: '寫報告' });
    expect(mocks.bindProofThumbs).toHaveBeenCalledWith(row, expect.objectContaining({ ownerId: 'u1' }));
    // Choosing it for the Personal Space photo wall reports back.
    const { onPhotoWallChange } = mocks.bindProofThumbs.mock.calls[0][1];
    onPhotoWallChange({ selected: true });
    expect(mocks.showToast).toHaveBeenLastCalledWith('已展示到個人空間');
    onPhotoWallChange({ selected: false });
    expect(mocks.showToast).toHaveBeenLastCalledWith('已取消個人空間展示');
    onPhotoWallChange({ error: new Error('quota') });
    expect(mocks.showToast).toHaveBeenLastCalledWith('無法更新個人空間展示');
  });

  it('adds no second thumbnail, and needs no row on the page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const row = logRow('s1', '<span class="session-proof-thumb-wrap"></span>');
    await showProofSheet('s1', '寫報告');
    await choose();
    sheet().querySelector('#proof-confirm').click();
    expect(row.querySelectorAll('.session-proof-thumb-wrap')).toHaveLength(1);
    expect(mocks.bindProofThumbs).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    await showProofSheet('s9', '別的任務');
    await choose();
    expect(() => sheet().querySelector('#proof-confirm').click()).not.toThrow();
    expect(mocks.saveProof).toHaveBeenLastCalledWith('s9', PHOTO);
  });

  it('closes without saving with Skip or a tap outside the sheet', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    await showProofSheet('s1', '寫報告');
    sheet().querySelector('#proof-skip').click();
    vi.advanceTimersByTime(300);
    expect(sheet()).toBe(null);
    await showProofSheet('s1', '寫報告');
    overlay().click();
    vi.advanceTimersByTime(300);
    expect(sheet()).toBe(null);
    expect(mocks.saveProof).not.toHaveBeenCalled();
  });
});

describe('without the photo pipeline', () => {
  it('opens nothing when the capture module cannot load (offline, old cache)', async () => {
    vi.resetModules();
    vi.doMock('../../pwa/js/platform/proofCapture.js', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    try {
      const fresh = await import('../../pwa/js/ui/proofSheet.js');
      await expect(fresh.showProofSheet('s1', '寫報告')).resolves.toBeUndefined();
      expect(sheet()).toBe(null);
    } finally {
      vi.doUnmock('../../pwa/js/platform/proofCapture.js');
    }
  });
});
