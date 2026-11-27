/**
 * @vitest-environment jsdom
 *
 * routerFirstRender.test.js — the router's first render does not slide
 * (TEST-016). On its own because the router remembers the last page for the
 * life of the module: in routerNavigation.test.js this only held while the
 * test happened to run first.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../pwa/js/pages/home.js', () => ({ renderHome: vi.fn() }));
vi.mock('../../pwa/js/pages/goals.js', () => ({ renderGoals: vi.fn() }));
vi.mock('../../pwa/js/pages/review.js', () => ({ renderReview: vi.fn() }));
vi.mock('../../pwa/js/pages/profile.js', () => ({ renderProfile: vi.fn() }));
vi.mock('../../pwa/js/pages/settings.js', () => ({ renderSettings: vi.fn() }));
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn() }));

const { renderPage } = await import('../../pwa/js/router.js');

describe('first render', () => {
  it('shows the page without a slide; the next page change slides', async () => {
    document.body.innerHTML = '<main id="content"></main><nav><button class="nav-item" data-page="goals"></button></nav>';
    const content = document.getElementById('content');
    await renderPage('goals');
    expect(content.className).toBe('');
    expect(document.querySelector('.nav-item').classList.contains('active')).toBe(true);
    await renderPage('review');
    expect(content.classList.contains('page-slide-left')).toBe(true);
  });
});
