// @vitest-environment jsdom
/**
 * sessionRowProofAdded.test.js — BUG-124 (a): a photo added from the proof
 * sheet (ui/proofSheet.js) is put into its row without a re-render. The list
 * that rendered the rows (bindProofThumbs) takes it in like its own: its
 * Personal Space switch updates every switch in the list and runs the page's
 * own handler (home also refreshes its Orbit Window photo). The sheet asks
 * with a cancelable 'orbit:proof-added' event; a page that does not answer
 * (an older cached sessionRow.js) leaves the sheet to bind the row itself.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pwa/js/platform/proofCloud.js', () => ({
  cloudProofUrl: () => null,
  wantsCloudProof: () => false,
  observeCloudProofs: () => {},
}));

import { getAchievementPhotoSelection, saveProof, setAchievementPhotoSelection } from '../../pwa/js/platform/proofStore.js';
import { bindProofThumbs, proofControlsHtml, sessionRowHtml } from '../../pwa/js/ui/sessionRow.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const sid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const session = n => ({ id: sid(n), taskName: `Task ${n}`, result: 'complete', finalXP: 10, completedAt: '2026-11-18T08:00:00.000Z' });
const PHOTO = 'data:image/jpeg;base64,AAAA';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  window._showProofLightbox = vi.fn();
});

/** Home's list (only home rows have the delete button the sheet finds a row by):
 * s0 has a photo shown in Personal Space; s1 has none yet. */
function page() {
  saveProof(sid(0), PHOTO);
  setAchievementPhotoSelection(OWNER, sid(0));
  const container = document.createElement('div');
  container.innerHTML = [0, 1].map(n => sessionRowHtml(session(n), { proofWallOwnerId: OWNER, showDelete: true })).join('');
  document.body.appendChild(container);
  return container;
}

/** What the proof sheet does after saving s1's photo: insert it, then ask the page. */
function addFromSheet(container, n = 1) {
  saveProof(sid(n), PHOTO);
  const row = container.querySelector(`.session-del-btn[data-session-id="${sid(n)}"]`).closest('.log-item');
  const shell = document.createElement('div');
  shell.innerHTML = proofControlsHtml(sid(n), { ownerId: OWNER, taskName: `Task ${n}` });
  const wrap = shell.firstElementChild;
  row.querySelector('.log-xp').before(wrap);
  const event = new window.CustomEvent('orbit:proof-added', { bubbles: true, cancelable: true });
  wrap.dispatchEvent(event);
  return { wrap, handled: event.defaultPrevented };
}

const wallButton = (container, n) => container.querySelector(`.session-proof-wall-btn[data-proof-wall-session-id="${sid(n)}"]`);

describe('a photo added from the proof sheet (BUG-124)', () => {
  it('is taken in by the list: its switch updates the whole list and runs the page\'s handler', () => {
    const container = page();
    const onPhotoWallChange = vi.fn();
    bindProofThumbs(container, { ownerId: OWNER, onPhotoWallChange });
    const { wrap, handled } = addFromSheet(container);
    expect(handled).toBe(true);
    expect(wallButton(container, 0).getAttribute('aria-pressed')).toBe('true');

    wrap.querySelector('.session-proof-wall-btn').click();
    expect(getAchievementPhotoSelection(OWNER)).toBe(sid(1));
    // The other row's switch is cleared too, not only this row's.
    expect(wallButton(container, 0).getAttribute('aria-pressed')).toBe('false');
    expect(wallButton(container, 0).textContent).toBe('🖼');
    expect(wallButton(container, 1).getAttribute('aria-pressed')).toBe('true');
    // The page's own handler (home: the Orbit Window photo) runs.
    expect(onPhotoWallChange).toHaveBeenCalledTimes(1);
    expect(onPhotoWallChange).toHaveBeenCalledWith(expect.objectContaining({ sessionId: sid(1), selected: true }));

    // Its preview opens the full-screen photo.
    wrap.querySelector('.session-proof-preview-btn').click();
    expect(window._showProofLightbox).toHaveBeenCalledWith(PHOTO);
    // The older rows were not bound again: one click there is one toggle.
    wallButton(container, 0).click();
    expect(getAchievementPhotoSelection(OWNER)).toBe(sid(0));
    expect(onPhotoWallChange).toHaveBeenCalledTimes(2);
  });

  it('uses the handler of the latest render only, once', () => {
    const container = page();
    const first = vi.fn();
    const latest = vi.fn();
    // The page renders again into the same container (#content is reused).
    bindProofThumbs(container, { ownerId: OWNER, onPhotoWallChange: first });
    bindProofThumbs(container, { ownerId: OWNER, onPhotoWallChange: latest });
    const { wrap } = addFromSheet(container);
    wrap.querySelector('.session-proof-wall-btn').click();
    // One toggle, not two (which would select and clear it again).
    expect(getAchievementPhotoSelection(OWNER)).toBe(sid(1));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('answers only for a thumbnail, and only once', () => {
    const container = page();
    bindProofThumbs(container, { ownerId: OWNER, onPhotoWallChange: vi.fn() });
    const other = new window.CustomEvent('orbit:proof-added', { bubbles: true, cancelable: true });
    container.querySelector('.log-xp').dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    // Already taken in by an inner list: left alone.
    const { wrap } = addFromSheet(container);
    const again = new window.CustomEvent('orbit:proof-added', { bubbles: true, cancelable: true });
    again.preventDefault();
    wrap.dispatchEvent(again);
    wrap.querySelector('.session-proof-wall-btn').click();
    expect(getAchievementPhotoSelection(OWNER)).toBe(sid(1));
  });

  it('is not answered outside a list, so the sheet binds the row itself', () => {
    const container = page();
    // No bindProofThumbs on this container: nobody answers.
    const { handled } = addFromSheet(container);
    expect(handled).toBe(false);
  });
});
