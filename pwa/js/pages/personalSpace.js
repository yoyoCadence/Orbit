import { state } from '../state.js';
import { buildPersonalSpaceViewModel } from '../personalSpace/index.js';
import { buildStarterCatalogView } from '../personalSpace/economy.js';
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
      <div class="card-title">Scene Runtime Placeholder</div>
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

    container.dispatchEvent(new CustomEvent(PERSONAL_SPACE_PURCHASE_REQUEST_EVENT, {
      bubbles: true,
      detail: {
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        source: 'starter-shop',
      },
    }));
  });

  const sceneContainer = container.querySelector('#personal-space-scene');
  activeRuntime = createSceneRuntime(sceneContainer, {
    label: nextUnlock ? nextUnlock.label : 'Unlocked Personal Space',
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
