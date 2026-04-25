import { state } from '../state.js';
import { buildPersonalSpaceViewModel } from '../personalSpace/index.js';
import { buildStarterCatalogView } from '../personalSpace/economy.js';
import { savePersonalSpaceState } from '../personalSpace/gameState.js';
import {
  createInteractionBus,
  PERSONAL_SPACE_ACTION_REQUESTED_EVENT,
} from '../personalSpace/interactionBus.js';
import { createSceneRuntime } from '../personalSpace/sceneRuntime.js';
import { renderDialogBubblePlaceholder } from '../personalSpace/ui/dialogBubble.js';
import { renderFloorMapPanel } from '../personalSpace/ui/floorMapPanel.js';
import { renderHudOverlayPlaceholder } from '../personalSpace/ui/hudOverlay.js';
import { renderShopPanel, SHOP_PURCHASE_ACTION } from '../personalSpace/ui/shopPanel.js';
import { SCENE_ACTION_TYPES } from '../personalSpace/world/sceneGraph.js';

let activeRuntime = null;
export const PERSONAL_SPACE_PURCHASE_REQUEST_EVENT = 'orbit:personal-space-purchase-request';

export function renderPersonalSpace(container) {
  const user = state.user;
  if (!user) return;

  if (activeRuntime) {
    activeRuntime.destroy();
    activeRuntime = null;
  }

  const model = buildPersonalSpaceViewModel(user);
  const starterCatalog = buildStarterCatalogView(model.ownedItems, model.gold.available);
  const nextUnlock = model.nextUnlock;
  const primaryWorkScene = model.sceneOptions.find(option => option.role === 'work' && option.id === model.activeWorkScene?.id);
  const isMemoryScene = isMemorySceneOption(model.activeScene, primaryWorkScene);
  const sceneInfoMarkup = buildSceneInfoMarkup(model, isMemoryScene);
  const sceneLocationMarkup = buildSceneLocationMarkup(model, primaryWorkScene);
  const sceneSwitcherMarkup = buildSceneSwitcherMarkup(model, primaryWorkScene);
  const interactionBus = createInteractionBus();
  const unlockedItems = model.unlockedMilestones
    .map(item => `<li>Lv.${item.level} · ${escapeHtml(item.label)}</li>`)
    .join('');
  const ownedItemsMarkup = model.ownedItems.length
    ? model.ownedItems
        .slice(0, 4)
        .map(item => `<li>${escapeHtml(item.name || item.id)}</li>`)
        .join('')
    : '<li>No purchased items yet</li>';
  const placedItemsMarkup = model.placedItems.length
    ? model.placedItems
        .slice(0, 4)
        .map(item => `<li>${escapeHtml(item.sceneId)} · ${escapeHtml(item.layoutItemId || item.itemId || item.id)}</li>`)
        .join('')
    : '<li>No placed items yet</li>';

  container.innerHTML = `
    <div class="section-title">🏠 個人空間</div>

    <div class="card">
      <div class="card-title">Orbit Personal Space</div>
      <div class="space-hero">
        <div>
          <div class="space-hero-title">Growth becomes a world you can inhabit.</div>
          <div class="space-hero-copy">
            這個頁面是 Orbit life-sim 化的第一階段入口。現在先建立可持續擴張的空間骨架，
            之後再逐步接上場景、家具經濟、角色行為與 AI companion。
          </div>
        </div>
        <div class="space-stage-badge">${formatStage(model.stage)}</div>
      </div>
    </div>

    <div class="space-stats-grid">
      <div class="card space-stat-card">
        <div class="card-title">Current Level</div>
        <div class="space-stat-value">Lv.${model.level}</div>
        <div class="space-stat-copy">${model.xpInfo.currentXP} / ${model.xpInfo.needed} XP to next level</div>
      </div>

      <div class="card space-stat-card">
        <div class="card-title">Available Gold</div>
        <div class="space-stat-value">${model.gold.available}</div>
        <div class="space-stat-copy">Earned: ${model.gold.totalEarned}. Spent from local state: ${model.gold.spent}</div>
      </div>

      <div class="card space-stat-card">
        <div class="card-title">Owned Items</div>
        <div class="space-stat-value">${model.ownedItemCount}</div>
        <div class="space-stat-copy">Placed separately: ${model.placedItemCount} item(s) in local layout state.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Scene Unlock Progress</div>
      <div class="space-next-unlock">
        ${
          nextUnlock
            ? `<strong>Next unlock: Lv.${nextUnlock.level} · ${escapeHtml(nextUnlock.label)}</strong>
               <span>${Math.max(0, nextUnlock.level - model.level)} level(s) remaining</span>`
            : '<strong>All v0 milestones unlocked</strong><span>Future versions can add prestige scenes and expression layers.</span>'
        }
      </div>
      <ul class="space-unlock-list">${unlockedItems}</ul>
    </div>

    <div class="card">
      <div class="card-title">Owned Furnishing Snapshot</div>
      <div class="space-stat-copy">Latest local ownership and placement data loaded into this page.</div>
      <ul class="space-unlock-list">${ownedItemsMarkup}</ul>
      <div class="space-stat-copy">Placed Items</div>
      <ul class="space-unlock-list">${placedItemsMarkup}</ul>
    </div>

    <div class="card">
      <div class="card-title">Current Scene Layer</div>
      <div class="space-scene-meta">
        ${sceneLocationMarkup}
        <div class="space-scene-meta-actions">
          <div class="space-scene-switcher">${sceneSwitcherMarkup}</div>
          ${renderFloorMapPanel(model)}
          ${sceneInfoMarkup}
        </div>
      </div>
      <div id="personal-space-scene" class="space-scene-shell"></div>
    </div>

    <div class="space-placeholder-grid">
      ${renderShopPanel(starterCatalog)}
      ${renderDialogBubblePlaceholder()}
      ${renderHudOverlayPlaceholder()}
    </div>
  `;

  container.querySelector('.space-shop-panel')?.addEventListener('click', event => {
    const purchaseButton = event.target.closest(`[data-action="${SHOP_PURCHASE_ACTION}"]`);
    if (!purchaseButton) return;

    const itemId = purchaseButton.dataset.itemId;
    const item = starterCatalog.find(entry => entry.id === itemId);
    if (!item || item.isOwned || !item.canAfford) return;

    container.dispatchEvent(new window.CustomEvent(PERSONAL_SPACE_PURCHASE_REQUEST_EVENT, {
      bubbles: true,
      detail: {
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        source: 'starter-shop',
      },
    }));
  });

  container.querySelector('.space-scene-switcher')?.addEventListener('click', event => {
    const categoryButton = event.target.closest('[data-scene-category]');
    if (categoryButton) {
      activateSceneCategory(container, categoryButton.dataset.sceneCategory);
      return;
    }

    const switchButton = event.target.closest('[data-scene-switch]');
    if (!switchButton) return;

    const sceneId = switchButton.dataset.sceneSwitch;
    if (!sceneId || sceneId === model.activeScene?.id) return;

    savePersonalSpaceState({
      ...model.personalSpaceState,
      selectedSceneId: sceneId,
    });
    renderPersonalSpace(container);
  });

  container.querySelector('.space-map-entry')?.addEventListener('click', event => {
    const mapButton = event.target.closest('[data-space-map-open]');
    if (!mapButton) return;

    openFloorMap(container, mapButton.dataset.spaceMapOpen);
  });

  container.querySelectorAll('[data-space-map-window]').forEach(mapWindow => {
    mapWindow.addEventListener('click', event => {
      if (!event.target.closest('[data-space-map-close]')) return;
      closeFloorMap(mapWindow);
    });
  });

  const sceneContainer = container.querySelector('#personal-space-scene');
  interactionBus.on(PERSONAL_SPACE_ACTION_REQUESTED_EVENT, payload => {
    const action = payload?.action;
    if (action?.type !== SCENE_ACTION_TYPES.CHANGE_SCENE || !action.sceneId) return;

    savePersonalSpaceState({
      ...model.personalSpaceState,
      selectedSceneId: action.sceneId,
    });
    renderPersonalSpace(container);
  });

  activeRuntime = createSceneRuntime(sceneContainer, {
    level: model.level,
    stage: model.stage,
    sceneId: model.activeScene?.id,
    sceneLabel: model.activeScene?.label,
    sceneRole: model.activeScene?.role,
    ownedItemCount: model.ownedItemCount,
    ownedItems: model.ownedItems,
    placedItems: model.placedItems,
    isMemoryScene,
    interactionBus,
  });
  activeRuntime.mount();
}

function formatStage(stage) {
  return {
    survival: 'Survival Stage',
    building: 'Building Stage',
    mastery: 'Mastery Stage',
  }[stage] || 'Early Stage';
}

function buildSceneSwitcherMarkup(model, primaryWorkScene) {
  const categories = buildSceneCategories(model.sceneOptions, primaryWorkScene);
  const activeCategoryId = categories.find(category => (
    category.options.some(option => option.id === model.activeScene?.id)
  ))?.id || categories[0]?.id;

  const categoryTabs = categories.map(category => {
    const isActive = category.id === activeCategoryId;
    const isEmpty = category.options.length === 0;

    return `
      <button
        class="space-scene-category ${isActive ? 'is-active' : ''} ${isEmpty ? 'is-locked' : ''}"
        type="button"
        data-scene-category="${category.id}"
        aria-selected="${isActive ? 'true' : 'false'}"
        aria-label="${isEmpty ? `${category.label}，尚未解鎖` : category.label}"
        ${isEmpty ? 'disabled' : ''}
      >
        <span>${category.label}</span>
        ${isEmpty ? '<span class="space-scene-category-lock" aria-hidden="true">🔒</span>' : ''}
      </button>
    `;
  }).join('');

  const categoryPanels = categories.map(category => {
    const isActive = category.id === activeCategoryId;
    const optionsMarkup = category.options.length
      ? category.options.map(option => renderSceneSwitchButton(option, model, primaryWorkScene)).join('')
      : '<span class="space-scene-empty">尚未解鎖</span>';

    return `
      <div
        class="space-scene-category-panel"
        data-scene-category-panel="${category.id}"
        ${isActive ? '' : 'hidden'}
      >
        ${optionsMarkup}
      </div>
    `;
  }).join('');

  return `
    <div class="space-scene-category-tabs" role="tablist" aria-label="Scene categories">
      ${categoryTabs}
    </div>
    <div class="space-scene-category-panels">
      ${categoryPanels}
    </div>
  `;
}

function buildSceneCategories(sceneOptions, primaryWorkScene) {
  const categories = [
    { id: 'home', label: '住處', options: [] },
    { id: 'work', label: '上班', options: [] },
    { id: 'memory', label: '回顧', options: [] },
  ];
  const categoryById = new Map(categories.map(category => [category.id, category]));

  sceneOptions.forEach(option => {
    const categoryId = getSceneCategoryId(option, primaryWorkScene);
    categoryById.get(categoryId)?.options.push(option);
  });

  return categories;
}

function buildSceneLocationMarkup(model, primaryWorkScene) {
  const categoryLabel = getSceneCategoryLabel(model.activeScene, primaryWorkScene);
  const sceneLabel = model.activeScene?.label || 'Current scene';

  return `
    <div class="space-scene-location">
      <span>你現在位於</span>
      <strong>${escapeHtml(categoryLabel)} / ${escapeHtml(sceneLabel)}</strong>
    </div>
  `;
}

function renderSceneSwitchButton(option, model, primaryWorkScene) {
  return `
    <button
      class="space-scene-switch ${option.id === model.activeScene?.id ? 'is-active' : ''}"
      type="button"
      data-scene-switch="${escapeHtml(option.id)}"
    >
      ${escapeHtml(option.shortLabel)}
      ${renderSceneSwitchBadge(option, primaryWorkScene)}
    </button>
  `;
}

function getSceneCategoryId(option, primaryWorkScene) {
  if (isMemorySceneOption(option, primaryWorkScene)) return 'memory';
  if (option?.role === 'work') return 'work';
  return 'home';
}

function getSceneCategoryLabel(option, primaryWorkScene) {
  return {
    home: '住處',
    work: '上班',
    memory: '回顧',
  }[getSceneCategoryId(option, primaryWorkScene)] || '住處';
}

function activateSceneCategory(container, categoryId) {
  if (!categoryId) return;

  container.querySelectorAll('[data-scene-category]').forEach(button => {
    const isActive = button.dataset.sceneCategory === categoryId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  container.querySelectorAll('[data-scene-category-panel]').forEach(panel => {
    panel.hidden = panel.dataset.sceneCategoryPanel !== categoryId;
  });
}

function openFloorMap(container, buildingId) {
  const mapWindow = Array.from(container.querySelectorAll('[data-space-map-window]'))
    .find(windowNode => windowNode.dataset.spaceMapWindow === buildingId);
  if (!mapWindow) return;

  mapWindow.hidden = false;
}

function closeFloorMap(mapWindow) {
  mapWindow.hidden = true;
}

function buildSceneInfoMarkup(model, isMemoryScene) {
  const title = isMemoryScene ? '場景說明 / 回顧' : '場景說明';
  const body = describeSceneInfo(model, isMemoryScene);

  return `
    <details class="space-scene-info">
      <summary class="space-scene-info-toggle" aria-label="${title}">i</summary>
      <div class="space-scene-info-panel">
        <strong>${title}</strong>
        <p>${escapeHtml(body)}</p>
      </div>
    </details>
  `;
}

function describeSceneInfo(model, isMemoryScene) {
  if (isMemoryScene) {
    if (model.activeScene?.role === 'work') {
      return '這個舊辦公樓層已轉為可回顧的 memory property。你仍可回來看看當年的工作環境，而這一層現在會有其他員工繼續工作。';
    }

    return '這個場景屬於可回顧的 memory property。它保存早期生活階段的意義，之後可接上回購、紀念與狀態保存規則。';
  }

  if (model.stage === 'mastery' && model.activeScene?.role === 'work') {
    return '你現在的主要居所已經是豪宅，但仍會回公司工作。公司場景代表身份與事業線，豪宅代表生活與個人空間。';
  }

  if (model.stage === 'mastery') {
    return '掌控期會把主居所轉為豪宅，逐步解鎖更高級的私人辦公室、大客廳與遊戲房等空間。';
  }

  if (model.stage === 'building' && model.activeScene?.role === 'work') {
    return '建設期以公司為主進展。隨等級提升，你會在同一棟大樓裡往更高樓層與更高級辦公空間成長。';
  }

  if (model.stage === 'building') {
    return '建設期仍可回租屋處，這符合真實生活節奏：白天進公司，晚上仍會回到原本的居所。';
  }

  return '生存期先從租屋處開始，重點是讓房間逐步變得更能住，再慢慢打開通往外部世界的入口。';
}

function renderSceneSwitchBadge(option, primaryWorkScene) {
  if (option.memoryProperty) return '<span class="space-scene-switch-badge">回顧</span>';

  const isOlderWorkScene = option.role === 'work'
    && primaryWorkScene
    && option.id !== primaryWorkScene.id
    && option.minLevel < primaryWorkScene.minLevel;

  if (!isOlderWorkScene) return '';

  return '<span class="space-scene-switch-badge">回顧</span>';
}

function isMemorySceneOption(option, primaryWorkScene) {
  if (!option) return false;
  if (option.memoryProperty) return true;

  return option.role === 'work'
    && primaryWorkScene
    && option.id !== primaryWorkScene.id
    && option.minLevel < primaryWorkScene.minLevel;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
