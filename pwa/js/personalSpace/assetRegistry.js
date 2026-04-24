export const assetRegistry = {
  scenes: {
    'rough-room': {
      id: 'rough-room',
      label: 'Rough Rental Room',
      runtime: 'placeholder',
    },
    'upgraded-rental': {
      id: 'upgraded-rental',
      label: 'Upgraded Rental Room',
      runtime: 'placeholder',
    },
    'company-building': {
      id: 'company-building',
      label: 'Company Building',
      runtime: 'placeholder',
    },
  },
  visualAssets: {
    'office-window-skyline-default': {
      id: 'office-window-skyline-default',
      label: 'Default Office Window Skyline',
      type: 'background',
      runtime: 'image',
      path: 'assets/personal-space/window/office-window-bg-day.png',
    },
    'office-window-skyline-night': {
      id: 'office-window-skyline-night',
      label: 'Office Window Skyline Night',
      type: 'background',
      runtime: 'image',
      path: 'assets/personal-space/window/office-window-bg-night.png',
    },
    'office-window-skyline-rain': {
      id: 'office-window-skyline-rain',
      label: 'Office Window Skyline Rain',
      type: 'background',
      runtime: 'image',
      path: 'assets/personal-space/window/office-window-bg-rain.png',
    },
    'office-window-skyline-sunset': {
      id: 'office-window-skyline-sunset',
      label: 'Office Window Skyline Sunset',
      type: 'background',
      runtime: 'image',
      path: 'assets/personal-space/window/office-window-bg-sunset.png',
    },
    'office-window-portrait-default': {
      id: 'office-window-portrait-default',
      label: 'Office Window Portrait Default',
      type: 'foreground-illustration',
      runtime: 'image',
      path: 'assets/personal-space/window/office-window-portrait-default.png',
    },
    'rental-bed-basic': buildPropAsset('rental-bed-basic', 'Rental Bed Basic'),
    'rental-desk-basic': buildPropAsset('rental-desk-basic', 'Rental Desk Basic'),
    'rental-chair-basic': buildPropAsset('rental-chair-basic', 'Rental Chair Basic'),
    'rental-lamp-basic': buildPropAsset('rental-lamp-basic', 'Rental Lamp Basic'),
    'rental-plant-basic': buildPropAsset('rental-plant-basic', 'Rental Plant Basic'),
    'rental-wall-art-basic': buildPropAsset('rental-wall-art-basic', 'Rental Wall Art Basic'),
    'office-corner-desk': buildPropAsset('office-corner-desk', 'Office Corner Desk'),
    'office-chair-basic': buildPropAsset('office-chair-basic', 'Office Chair Basic'),
    'office-monitor-single': buildPropAsset('office-monitor-single', 'Office Monitor Single'),
    'office-monitor-dual': buildPropAsset('office-monitor-dual', 'Office Monitor Dual'),
    'office-shelf-basic': buildPropAsset('office-shelf-basic', 'Office Shelf Basic'),
    'office-plant-basic': buildPropAsset('office-plant-basic', 'Office Plant Basic'),
    'office-board-basic': buildPropAsset('office-board-basic', 'Office Board Basic'),
    'estate-sofa-basic': buildPropAsset('estate-sofa-basic', 'Estate Sofa Basic'),
    'estate-table-basic': buildPropAsset('estate-table-basic', 'Estate Table Basic'),
    'estate-palm-basic': buildPropAsset('estate-palm-basic', 'Estate Palm Basic'),
    'estate-private-desk': buildPropAsset('estate-private-desk', 'Estate Private Desk'),
    'estate-lounge-art': buildPropAsset('estate-lounge-art', 'Estate Lounge Art'),
    'estate-game-console': buildPropAsset('estate-game-console', 'Estate Game Console'),
    'estate-display-shelf': buildPropAsset('estate-display-shelf', 'Estate Display Shelf'),
  },
  companions: {
    orbitGuide: {
      id: 'orbitGuide',
      label: 'Orbit Guide',
      behaviorProfile: 'supportive-rule-based',
    },
  },
};

export function getSceneAsset(sceneId) {
  return assetRegistry.scenes[sceneId] || null;
}

export function getVisualAsset(assetId) {
  return assetRegistry.visualAssets[assetId] || null;
}

function buildPropAsset(id, label) {
  return {
    id,
    label,
    type: 'prop',
    runtime: 'image',
    path: `assets/personal-space/props/${id}.png`,
  };
}
