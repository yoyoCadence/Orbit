/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { state } from '../../pwa/js/state.js';
import { renderPersonalSpace } from '../../pwa/js/pages/personalSpace.js';

describe('renderPersonalSpace', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    state.user = {
      id: 'u1',
      name: 'Tester',
      totalXP: 600,
    };
  });

  it('renders level, gold, and placeholder sections', () => {
    renderPersonalSpace(container);

    expect(container.textContent).toContain('個人空間');
    expect(container.textContent).toContain('Available Gold');
    expect(container.querySelector('#personal-space-scene')).not.toBeNull();
    expect(container.textContent).toContain('Future Shop');
  });
});
