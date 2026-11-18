// @vitest-environment jsdom
/**
 * HW-112C1: where the app hands proof photos to proofSync.js.
 * - Saving a photo in the proof sheet queues it for upload, for a signed-in
 *   account only (a guest's photos stay on this device).
 * - Deleting a session deletes its photo (and, signed in, the cloud copy).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sync = vi.hoisted(() => ({ proofSaved: vi.fn(), proofSessionDeleted: vi.fn() }));
const presence = vi.hoisted(() => ({ signedIn: true }));

vi.mock('../../pwa/js/platform/proofSync.js', () => sync);
vi.mock('../../pwa/js/sessionPresence.js', () => ({ hasStoredSession: () => presence.signedIn }));
vi.mock('../../pwa/js/storage.js', () => ({
  storage: { saveSessions: vi.fn(), saveEnergy: vi.fn(), saveUser: vi.fn() },
  db: { deleteSession: vi.fn(() => Promise.resolve(false)) },
}));
vi.mock('../../pwa/js/router.js', () => ({ renderPage: vi.fn(), currentHash: () => 'home' }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn(), showXPFloat: vi.fn(), showLevelUp: vi.fn() }));
vi.mock('../../pwa/js/ui/header.js', () => ({ updateHeader: vi.fn() }));
vi.mock('../../pwa/js/platform/haptics.js', () => ({ haptic: vi.fn() }));
vi.mock('../../pwa/js/ui/sessionRow.js', () => ({ bindProofThumbs: vi.fn(), proofControlsHtml: () => '' }));
vi.mock('../../pwa/js/platform/proofCapture.js', () => ({
  compressImage: vi.fn(async () => 'data:image/jpeg;base64,/9j/'),
}));

import { state } from '../../pwa/js/state.js';
import '../../pwa/js/sessionFlow.js';
import { showProofSheet } from '../../pwa/js/ui/proofSheet.js';

const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  vi.clearAllMocks();
  presence.signedIn = true;
  state.user = { id: 'owner-1', totalXP: 10 };
  state.energy = { currentEnergy: 50, maxEnergy: 100, lastResetDate: '' };
  state.sessions = [{
    id: SESSION, taskName: 'Deep work', finalXP: 10, energyCost: 0, energyGain: 0,
  }];
  globalThis.confirm = vi.fn(() => true);
});

async function saveProofThroughSheet() {
  await showProofSheet(SESSION, 'Deep work');
  const input = document.querySelector('#proof-file-input');
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(document.querySelector('#proof-confirm').disabled).toBe(false));
  document.querySelector('#proof-confirm').click();
}

describe('proof sheet → upload queue', () => {
  it('queues the saved photo for a signed-in account', async () => {
    await saveProofThroughSheet();
    expect(localStorage.getItem(`orbit_proof_${SESSION}`)).toBe('data:image/jpeg;base64,/9j/');
    expect(sync.proofSaved).toHaveBeenCalledWith('owner-1', SESSION);
  });

  it('keeps a guest\'s photo on this device only', async () => {
    presence.signedIn = false;
    await saveProofThroughSheet();
    expect(localStorage.getItem(`orbit_proof_${SESSION}`)).not.toBeNull();
    expect(sync.proofSaved).not.toHaveBeenCalled();
  });
});

describe('session deletion → photo deletion', () => {
  it('deletes the photo here and in the cloud for a signed-in account', () => {
    window.deleteSession(SESSION);
    expect(sync.proofSessionDeleted).toHaveBeenCalledWith('owner-1', SESSION, { signedIn: true });
  });

  it('deletes only the local photo for a guest', () => {
    presence.signedIn = false;
    window.deleteSession(SESSION);
    expect(sync.proofSessionDeleted).toHaveBeenCalledWith('owner-1', SESSION, { signedIn: false });
  });

  it('does nothing when the deletion is cancelled', () => {
    globalThis.confirm = vi.fn(() => false);
    window.deleteSession(SESSION);
    expect(sync.proofSessionDeleted).not.toHaveBeenCalled();
  });
});
