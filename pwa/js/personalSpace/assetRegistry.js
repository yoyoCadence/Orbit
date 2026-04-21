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
