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
    expect(container.querySelector('.space-scene-info-toggle')).not.toBeNull();
    expect(container.querySelector('.space-scene-chip-row')).toBeNull();
    expect(container.textContent).toContain('你現在位於');
    expect(container.querySelector('[data-scene-category="home"]')?.textContent).toContain('住處');
    expect(container.querySelector('[data-scene-category="work"]')?.textContent).toContain('上班');
    expect(container.querySelector('[data-scene-category="memory"]')?.textContent).toContain('回顧');
    expect(container.querySelector('[data-scene-category="memory"]')?.disabled).toBe(true);
  });

  it('loads spent gold and owned items from persisted personal space state', () => {
    savePersonalSpaceState({
      spentGold: 120,
      ownedItems: [
        { id: 'small-plant', name: 'Small Plant' },
        { id: 'desk-lamp', name: 'Desk Lamp' },
      ],
      placedItems: [
        {
          sceneId: 'rough-room',
          layoutItemId: 'rental-bed',
        },
      ],
    });

    const model = buildPersonalSpaceViewModel(state.user);
    renderPersonalSpace(container);

    expect(model.gold.spent).toBe(120);
    expect(model.ownedItemCount).toBe(2);
    expect(model.placedItemCount).toBe(1);
    expect(container.textContent).toContain(String(model.gold.available));
    expect(container.textContent).toContain('Spent from local state: 120');
    expect(container.textContent).toContain('Owned Items');
    expect(container.textContent).toContain('Small Plant');
    expect(container.textContent).toContain('Desk Lamp');
    expect(container.textContent).toContain('Placed separately: 1 item');
    expect(container.textContent).toContain('rough-room');
    expect(container.textContent).toContain('rental-bed');
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
    expect(container.querySelector('[data-scene-node-id="office-corner-elevator"]')).not.toBeNull();
    expect(container.querySelector('[data-scene-node-id="office-window"]')).not.toBeNull();
    expect(container.textContent).toContain('公司一樓辦公角');
    expect(container.textContent).toContain('回租屋');
  });

  it('can change scenes through a data-driven exit node action', () => {
    state.user.totalXP = 600;

    renderPersonalSpace(container);
    container.querySelector('[data-scene-node-id="office-corner-elevator"]')?.click();

    expect(container.querySelector('.space-scene-placeholder--rental-upgraded')).not.toBeNull();
    expect(container.querySelector('[data-scene-id="upgraded-rental"]')).not.toBeNull();
    expect(container.textContent).toContain('住處 / 升級租屋處');
  });

  it('shows and exits the office window view from the window interaction node', () => {
    state.user.totalXP = 600;

    renderPersonalSpace(container);
    container.querySelector('[data-scene-node-id="office-window"]')?.click();

    expect(container.querySelector('[data-scene-view-id="office-window-view"]')).not.toBeNull();
    expect(container.textContent).toContain('窗外風景');
    expect(container.querySelector('.space-scene-view-skyline')?.getAttribute('style')).toContain('office-window-bg-day.png');
    expect(container.querySelector('.space-scene-view-portrait-image')?.getAttribute('src')).toContain('office-window-portrait-default.png');

    container.querySelector('[data-scene-view-back="office-window-view"]')?.click();

    expect(container.querySelector('[data-scene-view-id="office-window-view"]')).toBeNull();
    expect(container.querySelector('[data-scene-id="office-corner"]')).not.toBeNull();
  });

  it('renders provided prop sprites for the current 2D scene furniture', () => {
    state.user.totalXP = 600;

    renderPersonalSpace(container);

    const propImages = Array.from(container.querySelectorAll('.space-scene-item-image')).map(node => node.getAttribute('src'));
    const desk = container.querySelector('[data-scene-item-id="office-corner-desk"]');
    const chairShadow = container.querySelector('[data-scene-item-id="office-chair"] .space-scene-item-shadow');

    expect(propImages.some(src => src?.includes('office-corner-desk.png'))).toBe(true);
    expect(propImages.some(src => src?.includes('office-chair-basic.png'))).toBe(true);
    expect(propImages.some(src => src?.includes('office-monitor-single.png'))).toBe(true);
    expect(propImages.some(src => src?.includes('office-shelf-basic.png'))).toBe(true);
    expect(desk?.getAttribute('style')).toContain('z-index: 3');
    expect(desk?.getAttribute('style')).toContain('scale(1.08)');
    expect(chairShadow).not.toBeNull();
  });

  it('applies placed item overrides from local state to the current scene runtime', () => {
    state.user.totalXP = 600;
    savePersonalSpaceState({
      selectedSceneId: 'office-corner',
      placedItems: [
        {
          sceneId: 'office-corner',
          layoutItemId: 'office-corner-desk',
          placement: {
            x: '40%',
            scale: 1.18,
          },
        },
      ],
    });

    renderPersonalSpace(container);

    const desk = container.querySelector('[data-scene-item-id="office-corner-desk"]');

    expect(desk?.getAttribute('style')).toContain('left: 40%');
    expect(desk?.getAttribute('style')).toContain('scale(1.18)');
  });

  it('applies placed item overrides to formal workstation scenes as well', () => {
    state.user.totalXP = 1200;
    savePersonalSpaceState({
      selectedSceneId: 'formal-workstation',
      placedItems: [
        {
          sceneId: 'formal-workstation',
          layoutItemId: 'office-corner-desk',
          placement: {
            x: '46%',
            y: '78%',
            scale: 1.22,
            z: 5,
          },
        },
      ],
    });

    renderPersonalSpace(container);

    expect(container.querySelector('[data-scene-id="formal-workstation"]')).not.toBeNull();
    expect(container.textContent).toContain('Placed separately: 1 item');

    const desk = container.querySelector('[data-scene-item-id="office-corner-desk"]');

    expect(desk?.getAttribute('style')).toContain('left: 46%');
    expect(desk?.getAttribute('style')).toContain('top: 78%');
    expect(desk?.getAttribute('style')).toContain('z-index: 5');
    expect(desk?.getAttribute('style')).toContain('scale(1.22)');
  });

  it('allows switching back to rental in building stage', () => {
    state.user.totalXP = 600;

    renderPersonalSpace(container);
    container.querySelector('[data-scene-category="home"]')?.click();
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

  it('marks older office floors as memory property when revisiting them', () => {
    state.user.totalXP = 10000;

    renderPersonalSpace(container);
    container.querySelector('[data-scene-category="memory"]')?.click();
    container.querySelector('[data-scene-switch="office-corner"]')?.click();

    expect(container.textContent).toContain('回顧 / 公司一樓辦公角');
    expect(container.textContent).toContain('memory property');
    expect(container.textContent).toContain('回顧');
    expect(container.querySelectorAll('.space-scene-worker').length).toBeGreaterThan(0);
  });

  it('groups older office floors and buy-back rental under memory scenes', () => {
    state.user.totalXP = 30000;

    renderPersonalSpace(container);
    container.querySelector('[data-scene-category="memory"]')?.click();

    const memoryPanel = container.querySelector('[data-scene-category-panel="memory"]');

    expect(memoryPanel?.hidden).toBe(false);
    expect(memoryPanel?.querySelector('[data-scene-switch="office-corner"]')).not.toBeNull();
    expect(memoryPanel?.querySelector('[data-scene-switch="buy-back-rental"]')).not.toBeNull();
    expect(container.querySelector('[data-scene-category-panel="work"] [data-scene-switch="large-office-suite"]')).not.toBeNull();
  });
});
