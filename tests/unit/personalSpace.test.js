/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { state } from '../../pwa/js/state.js';
import { PERSONAL_SPACE_PURCHASE_REQUEST_EVENT, renderPersonalSpace } from '../../pwa/js/pages/personalSpace.js';
import { buildPersonalSpaceViewModel } from '../../pwa/js/personalSpace/index.js';
import { savePersonalSpaceState } from '../../pwa/js/personalSpace/gameState.js';

describe('renderPersonalSpace', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
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
    expect(container.textContent).toContain('Starter Shop');
    expect(container.textContent).toContain('Small Plant');
    expect(container.querySelector('.space-scene-window')).not.toBeNull();
    expect(container.querySelectorAll('.space-scene-item').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Current Scene Layer');
  });

  it('loads spent gold and owned items from persisted personal space state', () => {
    savePersonalSpaceState({
      spentGold: 120,
      ownedItems: [
        { id: 'small-plant', name: 'Small Plant' },
        { id: 'desk-lamp', name: 'Desk Lamp' },
      ],
    });

    const model = buildPersonalSpaceViewModel(state.user);
    renderPersonalSpace(container);

    expect(model.gold.spent).toBe(120);
    expect(model.ownedItemCount).toBe(2);
    expect(container.textContent).toContain(String(model.gold.available));
    expect(container.textContent).toContain('Spent from local state: 120');
    expect(container.textContent).toContain('Owned Items');
    expect(container.textContent).toContain('Small Plant');
    expect(container.textContent).toContain('Desk Lamp');
  });

  it('emits a purchase request event when clicking a starter catalog item', () => {
    let receivedDetail = null;
    container.addEventListener(PERSONAL_SPACE_PURCHASE_REQUEST_EVENT, event => {
      receivedDetail = event.detail;
    });

    renderPersonalSpace(container);
    container.querySelector('[data-item-id="small-plant"]')?.click();

    expect(receivedDetail).toEqual({
      itemId: 'small-plant',
      itemName: 'Small Plant',
      price: 100,
      source: 'starter-shop',
    });
  });

  it('defaults building stage to the company while keeping rental return available', () => {
    state.user.totalXP = 600;

    renderPersonalSpace(container);

    expect(container.querySelector('.space-scene-placeholder--office')).not.toBeNull();
    expect(container.querySelector('[data-scene-id="office-corner"]')).not.toBeNull();
    expect(container.textContent).toContain('公司一樓辦公角');
    expect(container.textContent).toContain('回租屋');
  });

  it('allows switching back to rental in building stage', () => {
    state.user.totalXP = 600;

    renderPersonalSpace(container);
    container.querySelector('[data-scene-switch="upgraded-rental"]')?.click();

    expect(container.querySelector('.space-scene-placeholder--rental-upgraded')).not.toBeNull();
    expect(container.querySelector('[data-scene-id="upgraded-rental"]')).not.toBeNull();
    expect(container.textContent).toContain('升級租屋處');
  });

  it('switches mastery stage to estate while keeping workplace accessible', () => {
    state.user.totalXP = 10000;

    renderPersonalSpace(container);

    expect(container.querySelector('.space-scene-placeholder--mastery')).not.toBeNull();
    expect(container.querySelector('[data-scene-id="estate-game-room"], [data-scene-id="estate-lounge"], [data-scene-id="estate-study"], [data-scene-id="estate-hall"]')).not.toBeNull();
    expect(container.textContent).toContain('豪宅');
    expect(container.textContent).toContain('主管室');
  });
});
