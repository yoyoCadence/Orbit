export const SHOP_PURCHASE_ACTION = 'personal-space-purchase';

export function renderShopPanel(catalogItems = []) {
  const itemsMarkup = catalogItems.length
    ? catalogItems
        .map(item => `
          <li class="space-shop-item">
            <div class="space-shop-item-copy">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${formatCategory(item.category)} · ${item.price} Gold</span>
            </div>
            <button
              class="btn btn-ghost"
              type="button"
              data-action="${SHOP_PURCHASE_ACTION}"
              data-item-id="${escapeHtml(item.id)}"
              ${item.isOwned ? 'disabled' : ''}
            >
              ${item.isOwned ? '已擁有' : item.canAfford ? '購買' : 'Gold 不足'}
            </button>
          </li>
        `)
        .join('')
    : '<li class="space-shop-item"><div class="space-shop-item-copy"><strong>No starter items</strong><span>Starter catalog will be defined here.</span></div></li>';

  return `
    <div class="space-placeholder-block space-shop-panel">
      <div class="space-placeholder-title">Starter Shop</div>
      <div class="space-placeholder-copy">Current starter catalog is visible now. Purchase writing will hook into the next task.</div>
      <ul class="space-unlock-list">${itemsMarkup}</ul>
    </div>
  `;
}

function formatCategory(category) {
  return {
    decor: 'Decor',
    smallFurniture: 'Small Furniture',
    functionalFurniture: 'Functional Furniture',
    officeEquipment: 'Office Equipment',
    spaceUpgrade: 'Space Upgrade',
  }[category] || 'General';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
