/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => {
  let resolvePersonalSpace;
  const personalSpaceGate = new Promise(resolve => { resolvePersonalSpace = resolve; });
  return {
    homeCleanup: vi.fn(),
    goalsCleanup: vi.fn(),
    reviewCleanup: vi.fn(),
    renderHome: vi.fn(),
    renderGoals: vi.fn(),
    renderReview: vi.fn(),
    renderPersonalSpace: vi.fn(),
    personalSpaceGate,
    resolvePersonalSpace,
  };
});

vi.mock('../../pwa/js/pages/home.js', () => ({
  renderHome: routeMocks.renderHome,
}));
vi.mock('../../pwa/js/pages/goals.js', () => ({
  renderGoals: routeMocks.renderGoals,
}));
vi.mock('../../pwa/js/pages/review.js', () => ({
  renderReview: routeMocks.renderReview,
}));
vi.mock('../../pwa/js/pages/profile.js', () => ({ renderProfile: vi.fn() }));
vi.mock('../../pwa/js/pages/settings.js', () => ({ renderSettings: vi.fn() }));
vi.mock('../../pwa/js/pages/personalSpace.js', async () => {
  await routeMocks.personalSpaceGate;
  return { renderPersonalSpace: routeMocks.renderPersonalSpace };
});
vi.mock('../../pwa/js/ui/feedback.js', () => ({ showToast: vi.fn() }));

import {
  createRouteRenderLifecycle,
  renderPage,
  teardownActivePageRenderer,
} from '../../pwa/js/router.js';

describe('route renderer lifecycle', () => {
  beforeEach(() => {
    teardownActivePageRenderer();
    vi.clearAllMocks();
    document.body.innerHTML = `
      <main id="content"></main>
      <button class="nav-item" data-page="home"></button>
      <button class="nav-item" data-page="goals"></button>
    `;
    routeMocks.renderHome.mockImplementation(content => {
      content.textContent = 'home';
      return routeMocks.homeCleanup;
    });
    routeMocks.renderGoals.mockImplementation(content => {
      content.textContent = 'goals';
      return routeMocks.goalsCleanup;
    });
    routeMocks.renderReview.mockImplementation(content => {
      content.textContent = 'review';
      return routeMocks.reviewCleanup;
    });
  });

  it('calls each renderer cleanup exactly once before the next render', async () => {
    await renderPage('home');
    expect(routeMocks.homeCleanup).not.toHaveBeenCalled();

    await renderPage('goals');
    expect(routeMocks.homeCleanup).toHaveBeenCalledTimes(1);

    await renderPage('review');
    expect(routeMocks.homeCleanup).toHaveBeenCalledTimes(1);
    expect(routeMocks.goalsCleanup).toHaveBeenCalledTimes(1);

    teardownActivePageRenderer();
    teardownActivePageRenderer();
    expect(routeMocks.reviewCleanup).toHaveBeenCalledTimes(1);
  });

  it('drops a stale lazy Personal Space render after navigation changes', async () => {
    const pendingPersonalSpace = renderPage('personalSpace');
    await Promise.resolve();

    await renderPage('home');
    routeMocks.resolvePersonalSpace();
    await pendingPersonalSpace;

    expect(routeMocks.renderPersonalSpace).not.toHaveBeenCalled();
    expect(document.getElementById('content').textContent).toBe('home');
    expect(document.getElementById('content').dataset.route).toBe('home');
  });

  it('immediately cleans a renderer that resolves after its generation went stale', () => {
    const lifecycle = createRouteRenderLifecycle();
    const staleCleanup = vi.fn();
    const first = lifecycle.begin();
    lifecycle.begin();

    expect(lifecycle.commit(first, staleCleanup)).toBe(false);
    expect(staleCleanup).toHaveBeenCalledTimes(1);
    lifecycle.dispose();
    expect(staleCleanup).toHaveBeenCalledTimes(1);
  });
});
