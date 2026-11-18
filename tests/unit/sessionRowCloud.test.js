// @vitest-environment jsdom
/**
 * HW-112C2a: session rows and cloud proof photos.
 * - No photo on this device, signed in: a hidden placeholder, no thumbnail yet.
 * - A guest (or a photo already here): exactly as before.
 * - Once the cloud photo arrives, the placeholder becomes the usual thumbnail,
 *   with the preview and the Personal Space button working across the list.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const cloud = vi.hoisted(() => ({
  urls: new Map(),
  wants: true,
  onLoaded: null,
  observedOwner: null,
}));

vi.mock('../../pwa/js/platform/proofCloud.js', () => ({
  cloudProofUrl: (_ownerId, sessionId) => cloud.urls.get(sessionId) ?? null,
  wantsCloudProof: (_ownerId, _sessionId, options) => {
    cloud.wantsOptions = options;
    return cloud.wants;
  },
  observeCloudProofs: (_container, ownerId, onLoaded) => {
    cloud.observedOwner = ownerId;
    cloud.onLoaded = onLoaded;
  },
}));

import { bindProofThumbs, proofControlsHtml, sessionRowHtml } from '../../pwa/js/ui/sessionRow.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const sid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const session = n => ({ id: sid(n), taskName: `Task <${n}>`, result: 'complete', finalXP: 10, completedAt: '2026-11-18T08:00:00.000Z' });

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  cloud.urls.clear();
  cloud.wants = true;
  cloud.onLoaded = null;
  cloud.observedOwner = null;
  window._showProofLightbox = vi.fn();
});

function list(...numbers) {
  const container = document.createElement('div');
  container.innerHTML = numbers.map(n => sessionRowHtml(session(n), { proofWallOwnerId: OWNER })).join('');
  document.body.appendChild(container);
  return container;
}

describe('proofControlsHtml', () => {
  it('a signed-in row without a photo here gets a hidden placeholder, not a thumbnail', () => {
    const holder = document.createElement('div');
    holder.innerHTML = proofControlsHtml(sid(1), { ownerId: OWNER, taskName: 'Deep <work>' });
    const placeholder = holder.querySelector('.session-proof-cloud');
    expect(placeholder.hidden).toBe(true);
    expect(placeholder.dataset.proofCloudSessionId).toBe(sid(1));
    expect(placeholder.dataset.proofCloudTaskName).toBe('Deep <work>');
    expect(holder.querySelector('.session-proof-thumb')).toBeNull();
    // A recent "not found" does not take the placeholder away (it is how the
    // row gets looked at again).
    expect(cloud.wantsOptions).toEqual({ evenIfMissed: true });
  });

  it('nothing for a guest or when no cloud photo is wanted', () => {
    cloud.wants = false;
    expect(proofControlsHtml(sid(1), { ownerId: OWNER })).toBe('');
  });

  it('a photo on this device wins, as before', () => {
    localStorage.setItem(`orbit_proof_${sid(1)}`, 'data:image/jpeg;base64,/9j/');
    cloud.urls.set(sid(1), 'blob:orbit/1');
    const holder = document.createElement('div');
    holder.innerHTML = proofControlsHtml(sid(1), { ownerId: OWNER });
    expect(holder.querySelector('.session-proof-thumb').getAttribute('src')).toBe('data:image/jpeg;base64,/9j/');
  });

  it('a cloud photo loaded earlier is shown at once', () => {
    cloud.urls.set(sid(1), 'blob:orbit/1');
    const holder = document.createElement('div');
    holder.innerHTML = proofControlsHtml(sid(1), { ownerId: OWNER });
    expect(holder.querySelector('.session-proof-thumb').getAttribute('src')).toBe('blob:orbit/1');
    expect(holder.querySelector('.session-proof-cloud')).toBeNull();
  });
});

describe('bindProofThumbs', () => {
  it('turns the placeholder into the thumbnail once the cloud photo arrives', () => {
    const container = list(1, 2);
    bindProofThumbs(container, { ownerId: OWNER });
    expect(cloud.observedOwner).toBe(OWNER);

    const placeholder = container.querySelector(`[data-proof-cloud-session-id="${sid(1)}"]`);
    cloud.urls.set(sid(1), 'blob:orbit/1');
    cloud.onLoaded(placeholder, 'blob:orbit/1');

    const row = container.querySelectorAll('.log-item')[0];
    expect(row.querySelector('.session-proof-cloud')).toBeNull();
    expect(row.querySelector('.session-proof-thumb').getAttribute('src')).toBe('blob:orbit/1');
    expect(row.querySelector('.session-proof-preview-btn').getAttribute('aria-label')).toContain('Task <1>');
    // The thumbnail sits where a local one would: before the XP.
    expect(row.querySelector('.session-proof-thumb-wrap').nextElementSibling.classList.contains('log-xp')).toBe(true);

    row.querySelector('.session-proof-preview-btn').click();
    expect(window._showProofLightbox).toHaveBeenCalledWith('blob:orbit/1');
  });

  it('selecting a cloud photo for Personal Space updates every row in the list', () => {
    localStorage.setItem(`orbit_proof_${sid(2)}`, 'data:image/jpeg;base64,/9j/');
    localStorage.setItem(`orbit_achievement_photo_${encodeURIComponent(OWNER)}`, sid(2));
    const container = list(1, 2);
    const onPhotoWallChange = vi.fn();
    bindProofThumbs(container, { ownerId: OWNER, onPhotoWallChange });
    cloud.urls.set(sid(1), 'blob:orbit/1');
    cloud.onLoaded(container.querySelector('.session-proof-cloud'), 'blob:orbit/1');

    container.querySelector(`[data-proof-wall-session-id="${sid(1)}"]`).click();
    expect(onPhotoWallChange).toHaveBeenCalledWith(expect.objectContaining({ sessionId: sid(1), selected: true }));
    expect(container.querySelector(`[data-proof-wall-session-id="${sid(1)}"]`).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector(`[data-proof-wall-session-id="${sid(2)}"]`).getAttribute('aria-pressed')).toBe('false');
  });

  it('does nothing when the photo turns out not to be there after all', () => {
    const container = list(1);
    bindProofThumbs(container, { ownerId: OWNER });
    cloud.onLoaded(container.querySelector('.session-proof-cloud'), 'blob:orbit/1'); // not in the cache
    expect(container.querySelector('.session-proof-cloud')).not.toBeNull();
    expect(container.querySelector('.session-proof-thumb')).toBeNull();
  });
});
