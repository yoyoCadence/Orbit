export function createSceneRuntime(container, sceneModel = {}) {
  let mounted = false;

  return {
    mount() {
      if (!container || mounted) return;
      mounted = true;

      const visualModel = buildSceneVisualModel(sceneModel);
      const furnitureMarkup = visualModel.furniture
        .map(item => `
          <div class="space-scene-item space-scene-item--${item.kind}" style="${item.style}">
            <span>${item.label}</span>
          </div>
        `)
        .join('');
      const progressMarkup = visualModel.progressTags
        .map(tag => `<li>${tag}</li>`)
        .join('');

      container.innerHTML = `
        <div class="space-scene-placeholder space-scene-placeholder--${visualModel.palette}" data-scene-id="${visualModel.sceneId}">
          <div class="space-scene-grid"></div>
          <div class="space-scene-copy">
            <strong>${visualModel.title}</strong>
            <span>${visualModel.copy}</span>
            <ul class="space-scene-progress">${progressMarkup}</ul>
          </div>
          <div class="space-scene-visual">
            <div class="space-scene-backdrop">
              <div class="space-scene-window space-scene-window--${visualModel.windowMood}"></div>
              <div class="space-scene-floor"></div>
              <div class="space-scene-silhouette space-scene-silhouette--${visualModel.silhouette}"></div>
              ${furnitureMarkup}
            </div>
          </div>
        </div>
      `;
    },
    destroy() {
      if (!container || !mounted) return;
      mounted = false;
      container.innerHTML = '';
    },
  };
}

function buildSceneVisualModel(sceneModel) {
  const level = sceneModel.level || 1;
  const stage = sceneModel.stage || 'survival';
  const sceneId = sceneModel.sceneId || defaultSceneId(stage);
  const sceneRole = sceneModel.sceneRole || 'home';
  const sceneLabel = sceneModel.sceneLabel || sceneId;
  const ownedItemCount = sceneModel.ownedItemCount || 0;

  return {
    sceneId,
    title: sceneTitle(sceneId, sceneLabel),
    copy: sceneCopy({ stage, sceneId, sceneRole, ownedItemCount }),
    palette: paletteForScene(sceneId, sceneRole, stage),
    silhouette: silhouetteForScene(sceneId, sceneRole, stage),
    windowMood: windowMoodForScene(level, sceneRole),
    furniture: buildFurnitureLayout({ sceneId, sceneRole, ownedItemCount, level }),
    progressTags: buildProgressTags({ level, stage, sceneRole, sceneId }),
  };
}

function buildFurnitureLayout({ sceneId, sceneRole, ownedItemCount, level }) {
  if (sceneRole === 'work') {
    return buildOfficeFurniture(sceneId, level);
  }

  if (sceneId.startsWith('estate-')) {
    return buildEstateFurniture(sceneId, ownedItemCount);
  }

  return buildRentalFurniture(sceneId, ownedItemCount);
}

function buildOfficeFurniture(sceneId, level) {
  const items = [
    { kind: 'desk', label: sceneId === 'office-corner' ? 'Corner Desk' : 'Desk', style: 'left: 14%; bottom: 10%; width: 42%; height: 18%;' },
    { kind: 'chair', label: 'Chair', style: 'left: 24%; bottom: 2%; width: 18%; height: 12%;' },
    { kind: 'monitor', label: level >= 15 ? 'Dual Screen' : 'Screen', style: 'left: 24%; bottom: 30%; width: 20%; height: 11%;' },
    { kind: 'shelf', label: 'Shelf', style: 'right: 8%; bottom: 12%; width: 16%; height: 34%;' },
  ];

  if (sceneId === 'small-office' || sceneId === 'mid-office' || sceneId === 'manager-room' || sceneId === 'large-office-suite') {
    items.push({ kind: 'plant', label: 'Plant', style: 'right: 28%; bottom: 10%; width: 12%; height: 18%;' });
  }

  if (sceneId === 'mid-office' || sceneId === 'manager-room' || sceneId === 'large-office-suite') {
    items.push({ kind: 'art', label: 'Board', style: 'right: 26%; top: 18%; width: 20%; height: 12%;' });
  }

  return items;
}

function buildRentalFurniture(sceneId, ownedItemCount) {
  const items = [
    { kind: 'bed', label: 'Bed', style: 'left: 8%; bottom: 8%; width: 36%; height: 18%;' },
    { kind: 'desk', label: 'Desk', style: 'right: 10%; bottom: 9%; width: 26%; height: 16%;' },
    { kind: 'lamp', label: 'Lamp', style: 'right: 18%; bottom: 26%; width: 10%; height: 12%;' },
  ];

  if (sceneId === 'upgraded-rental' || ownedItemCount >= 1) {
    items.push({ kind: 'plant', label: 'Plant', style: 'left: 48%; bottom: 9%; width: 11%; height: 17%;' });
  }

  if (sceneId === 'upgraded-rental') {
    items.push({ kind: 'art', label: 'Wall Art', style: 'left: 18%; top: 18%; width: 16%; height: 12%;' });
  }

  return items;
}

function buildEstateFurniture(sceneId, ownedItemCount) {
  const items = [
    { kind: 'sofa', label: 'Sofa', style: 'left: 12%; bottom: 10%; width: 34%; height: 18%;' },
    { kind: 'table', label: 'Table', style: 'left: 48%; bottom: 10%; width: 18%; height: 13%;' },
    { kind: 'plant', label: 'Palm', style: 'right: 10%; bottom: 12%; width: 12%; height: 25%;' },
  ];

  if (sceneId === 'estate-study') {
    items.push({ kind: 'desk', label: 'Private Desk', style: 'right: 12%; bottom: 10%; width: 28%; height: 16%;' });
  }

  if (sceneId === 'estate-lounge') {
    items.push({ kind: 'art', label: 'Lounge Art', style: 'right: 20%; top: 18%; width: 18%; height: 12%;' });
  }

  if (sceneId === 'estate-game-room') {
    items.push({ kind: 'console', label: 'Game Rig', style: 'right: 12%; bottom: 10%; width: 28%; height: 15%;' });
  }

  if (ownedItemCount >= 3) {
    items.push({ kind: 'shelf', label: 'Display', style: 'left: 8%; top: 18%; width: 14%; height: 28%;' });
  }

  return items;
}

function sceneTitle(sceneId, sceneLabel) {
  return sceneLabel || sceneId;
}

function sceneCopy({ stage, sceneId, sceneRole, ownedItemCount }) {
  if (sceneRole === 'work') {
    if (sceneId === 'office-corner') {
      return 'You have entered the company building. This is your first work corner, but home is still waiting when the day ends.';
    }

    if (sceneId === 'manager-room' || sceneId === 'large-office-suite') {
      return 'Work now happens in a higher-floor executive space. Even after moving home, the company remains part of your identity.';
    }

    return `Your current workplace reflects a clearer professional identity, while still carrying ${ownedItemCount} personal-space progress signal${ownedItemCount === 1 ? '' : 's'}.`;
  }

  if (sceneId.startsWith('estate-')) {
    return 'Mastery stage shifts your main residence to a private estate, where different rooms begin to represent comfort, identity, and personal expression.';
  }

  if (stage === 'building') {
    return 'You still return to your rental room after work. It is no longer the whole world, but it still holds your everyday life.';
  }

  return 'Survival stage starts in a rental room. Growth first makes the room more livable before the wider city begins to open.';
}

function buildProgressTags({ level, stage, sceneRole, sceneId }) {
  return [
    `Lv.${level} scene state`,
    sceneRole === 'work' ? 'Workplace active' : sceneId.startsWith('estate-') ? 'Primary residence' : 'Rental home',
    stage === 'mastery' ? 'Mastery stage' : stage === 'building' ? 'Building stage' : 'Survival stage',
  ];
}

function paletteForScene(sceneId, sceneRole, stage) {
  if (sceneRole === 'work') return 'office';
  if (sceneId.startsWith('estate-')) return 'mastery';
  if (sceneId === 'upgraded-rental') return 'rental-upgraded';
  return stage === 'survival' ? 'survival' : 'building';
}

function silhouetteForScene(sceneId, sceneRole, stage) {
  if (sceneRole === 'work') return 'office';
  if (sceneId.startsWith('estate-')) return 'suite';
  return stage === 'survival' ? 'room' : 'room-upgraded';
}

function windowMoodForScene(level, sceneRole) {
  if (sceneRole === 'work') return level >= 40 ? 'skyline' : 'day';
  if (level >= 40) return 'sunrise';
  if (level >= 8) return 'day';
  return 'dusk';
}

function defaultSceneId(stage) {
  return {
    survival: 'rough-room',
    building: 'office-corner',
    mastery: 'estate-hall',
  }[stage] || 'rough-room';
}
