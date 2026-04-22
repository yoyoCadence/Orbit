export const PRICE_BANDS = {
  decor: [80, 180],
  smallFurniture: [220, 450],
  functionalFurniture: [500, 900],
  officeEquipment: [900, 1800],
  spaceUpgrade: [2000, 5000],
};

export const STARTER_CATALOG = [
  { id: 'small-plant', name: 'Small Plant', category: 'decor', price: 100 },
  { id: 'desk-lamp', name: 'Desk Lamp', category: 'decor', price: 100 },
  { id: 'wall-art', name: 'Wall Art', category: 'decor', price: 100 },
  { id: 'small-chair', name: 'Small Chair', category: 'smallFurniture', price: 220 },
  { id: 'tea-table', name: 'Tea Table', category: 'smallFurniture', price: 220 },
  { id: 'bedside-cabinet', name: 'Bedside Cabinet', category: 'smallFurniture', price: 220 },
  { id: 'bookshelf', name: 'Bookshelf', category: 'functionalFurniture', price: 450 },
  { id: 'desk', name: 'Desk', category: 'functionalFurniture', price: 450 },
  { id: 'sofa', name: 'Sofa', category: 'functionalFurniture', price: 450 },
  { id: 'computer-desk', name: 'Computer Desk', category: 'officeEquipment', price: 850 },
  { id: 'dual-monitors', name: 'Dual Monitors', category: 'officeEquipment', price: 850 },
  { id: 'whiteboard', name: 'Whiteboard', category: 'officeEquipment', price: 850 },
  { id: 'room-theme-pack', name: 'Room Theme Pack', category: 'spaceUpgrade', price: 2500 },
  { id: 'office-floor-upgrade', name: 'Office Floor Upgrade', category: 'spaceUpgrade', price: 2500 },
];

export function buildStarterCatalogView(ownedItems = [], availableGold = 0) {
  const ownedIds = new Set(
    (Array.isArray(ownedItems) ? ownedItems : [])
      .map(item => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean)
  );

  return STARTER_CATALOG.map(item => ({
    ...item,
    isOwned: ownedIds.has(item.id),
    canAfford: availableGold >= item.price,
  }));
}

export function goldReward(level) {
  return Math.round(60 + 12 * level + 8 * Math.sqrt(level));
}

export function milestoneBonus(level) {
  return level % 5 === 0 ? 120 + 20 * level : 0;
}

export function getTotalGoldForLevel(level) {
  if (level <= 1) return 0;

  let total = 0;
  for (let current = 2; current <= level; current += 1) {
    total += goldReward(current) + milestoneBonus(current);
  }
  return total;
}

export function estimateAvailableGold(level, spentGold = 0) {
  return Math.max(0, getTotalGoldForLevel(level) - spentGold);
}
