export function getPlacedFurnitureForScene({ sceneId, layoutItems = [], placedItems = [], ownedItems = [] }) {
  const scenePlacedItems = (Array.isArray(placedItems) ? placedItems : [])
    .filter(item => item?.sceneId === sceneId);
  const placementByLayoutId = new Map(
    scenePlacedItems
      .filter(item => item.layoutItemId)
      .map(item => [item.layoutItemId, item])
  );
  const ownedIds = new Set(
    (Array.isArray(ownedItems) ? ownedItems : [])
      .map(item => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean)
  );

  const resolvedLayoutItems = layoutItems
    .map(item => {
      const placement = placementByLayoutId.get(item.id);
      if (placement?.hidden) return null;

      return {
        ...item,
        placement: placement?.placement
          ? {
              ...item.placement,
              ...placement.placement,
            }
          : item.placement,
      };
    })
    .filter(Boolean);

  const customPlacedItems = scenePlacedItems
    .filter(item => !item.layoutItemId)
    .filter(item => !item.itemId || ownedIds.has(item.itemId))
    .map(item => ({
      id: item.id,
      itemId: item.itemId || null,
      kind: item.kind || 'decor',
      label: item.label || item.itemId || item.assetId || 'Placed Item',
      assetId: item.assetId || item.itemId || null,
      placement: item.placement,
      shadow: item.shadow || null,
      source: 'placed-item',
    }));

  return [
    ...resolvedLayoutItems,
    ...customPlacedItems,
  ];
}
