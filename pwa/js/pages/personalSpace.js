import { state } from '../state.js';
import { buildPersonalSpaceViewModel } from '../personalSpace/index.js';
import { buildStarterCatalogView } from '../personalSpace/economy.js';
import { savePersonalSpaceState } from '../personalSpace/gameState.js';
import { createSceneRuntime } from '../personalSpace/sceneRuntime.js';
import { renderDialogBubblePlaceholder } from '../personalSpace/ui/dialogBubble.js';
import { renderHudOverlayPlaceholder } from '../personalSpace/ui/hudOverlay.js';
import { renderShopPanel, SHOP_PURCHASE_ACTION } from '../personalSpace/ui/shopPanel.js';

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
  const isMemoryScene = model.activeScene?.role === 'work' && model.activeScene?.id !== primaryWorkScene?.id;
  const sceneInfoMarkup = buildSceneInfoMarkup(model, isMemoryScene);
  const sceneTagMarkup = buildSceneTagMarkup(model, isMemoryScene);
  const sceneSwitcherMarkup = model.sceneOptions
    .map(option => `
      <button
        class="space-scene-switch ${option.id === model.activeScene?.id ? 'is-active' : ''}"
        type="button"
        data-scene-switch="${escapeHtml(option.id)}"
      >
        ${escapeHtml(option.shortLabel)}
        ${renderSceneSwitchBadge(option, model)}
      </button>
    `)
    .join('');
  const unlockedItems = model.unlockedMilestones
    .map(item => `<li>Lv.${item.level} · ${escapeHtml(item.label)}</li>`)
    .join('');
  const ownedItemsMarkup = model.ownedItems.length
    ? model.ownedItems
        .slice(0, 4)
        .map(item => `<li>${escapeHtml(item.name || item.id)}</li>`)
        .join('')
    : '<li>No purchased items yet</li>';

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
        <div class="space-stat-copy">Persisted in local personal space state.</div>
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
      <div class="space-stat-copy">Latest local ownership data loaded into this page.</div>
      <ul class="space-unlock-list">${ownedItemsMarkup}</ul>
    </div>

    <div class="card">
      <div class="card-title">Current Scene Layer</div>
      <div class="space-scene-meta">
        <div>
          <div class="space-scene-meta-title">${escapeHtml(model.activeScene?.label || 'Current scene')}</div>
        </div>
        <div class="space-scene-meta-actions">
          <div class="space-scene-switcher">${sceneSwitcherMarkup}</div>
          ${sceneInfoMarkup}
        </div>
      </div>
      <div id="personal-space-scene" class="space-scene-shell"></div>
      <div class="space-scene-chip-row">${sceneTagMarkup}</div>
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

  const sceneContainer = container.querySelector('#personal-space-scene');
  activeRuntime = createSceneRuntime(sceneContainer, {
    level: model.level,
    stage: model.stage,
    sceneId: model.activeScene?.id,
    sceneLabel: model.activeScene?.label,
    sceneRole: model.activeScene?.role,
    ownedItemCount: model.ownedItemCount,
    isMemoryScene,
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

function buildSceneTagMarkup(model, isMemoryScene) {
  const tags = [
    `Lv.${model.level}`,
    formatStage(model.stage),
    model.activeScene?.role === 'work' ? '公司場景' : model.activeScene?.id?.startsWith('estate-') ? '豪宅場景' : '居住場景',
  ];

  if (isMemoryScene) {
    tags.push('Memory Property');
  } else if (model.activeScene?.role === 'work') {
    tags.push('Current Workplace');
  } else if (model.activeScene?.id?.startsWith('estate-')) {
    tags.push('Primary Residence');
  } else {
    tags.push('Rental Home');
  }

  return tags.map(tag => `<span class="space-scene-chip">${escapeHtml(tag)}</span>`).join('');
}

function describeSceneInfo(model, isMemoryScene) {
  if (isMemoryScene) {
    return '這個舊辦公樓層已轉為可回顧的 memory property。你仍可回來看看當年的工作環境，而這一層現在會有其他員工繼續工作。';
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

function renderSceneSwitchBadge(option, model) {
  const isOlderWorkScene = option.role === 'work'
    && model.activeWorkScene
    && option.id !== model.activeWorkScene.id
    && option.minLevel < model.activeWorkScene.minLevel;

  if (!isOlderWorkScene) return '';

  return '<span class="space-scene-switch-badge">回顧</span>';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
