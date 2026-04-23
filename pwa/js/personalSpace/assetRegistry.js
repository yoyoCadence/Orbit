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
      runtime: 'placeholder',
    },
    'office-window-portrait-placeholder': {
      id: 'office-window-portrait-placeholder',
      label: 'Window View Portrait Placeholder',
      type: 'foreground-illustration',
      runtime: 'placeholder',
    },
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
