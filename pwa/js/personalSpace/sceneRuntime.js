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
          <div class="space-scene-backdrop">
            <div class="space-scene-window space-scene-window--${visualModel.windowMood}"></div>
            <div class="space-scene-floor"></div>
            <div class="space-scene-silhouette space-scene-silhouette--${visualModel.silhouette}"></div>
            ${furnitureMarkup}
          </div>
          <div class="space-scene-copy">
            <strong>${visualModel.title}</strong>
            <span>${visualModel.copy}</span>
            <ul class="space-scene-progress">${progressMarkup}</ul>
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
  const sceneId = sceneModel.sceneId || 'rough-room';
  const ownedItemCount = sceneModel.ownedItemCount || 0;
  const isOffice = sceneId.includes('office') || sceneId.includes('company');

  return {
    sceneId,
    title: sceneLabel(sceneId, stage),
    copy: sceneCopy(stage, isOffice, ownedItemCount),
    palette: isOffice ? 'office' : stage,
    silhouette: isOffice ? 'office' : stage === 'mastery' ? 'suite' : 'room',
    windowMood: level >= 20 ? 'sunrise' : level >= 8 ? 'day' : 'dusk',
    furniture: buildFurnitureLayout({ stage, isOffice, ownedItemCount, level }),
    progressTags: [
      `Lv.${level} scene state`,
      `${ownedItemCount} owned item${ownedItemCount === 1 ? '' : 's'}`,
      stage === 'mastery' ? 'Stable growth atmosphere' : stage === 'building' ? 'Expansion in progress' : 'Starter shelter',
    ],
  };
}

function buildFurnitureLayout({ stage, isOffice, ownedItemCount, level }) {
  const items = [];

  if (isOffice) {
    items.push({ kind: 'desk', label: 'Desk', style: 'left: 20%; bottom: 22%; width: 28%; height: 17%;' });
    items.push({ kind: 'chair', label: 'Chair', style: 'left: 31%; bottom: 13%; width: 14%; height: 13%;' });
    items.push({ kind: 'monitor', label: level >= 15 ? 'Dual Screen' : 'Screen', style: 'left: 29%; bottom: 34%; width: 16%; height: 11%;' });
    items.push({ kind: 'shelf', label: 'Shelf', style: 'right: 13%; bottom: 20%; width: 18%; height: 33%;' });
  } else {
    items.push({ kind: 'bed', label: 'Bed', style: 'left: 10%; bottom: 20%; width: 30%; height: 19%;' });
    items.push({ kind: 'desk', label: 'Desk', style: 'right: 12%; bottom: 18%; width: 22%; height: 16%;' });
    items.push({ kind: 'lamp', label: 'Lamp', style: 'right: 22%; bottom: 34%; width: 9%; height: 12%;' });
  }

  if (stage !== 'survival' || ownedItemCount >= 1) {
    items.push({ kind: 'plant', label: 'Plant', style: 'left: 48%; bottom: 19%; width: 11%; height: 18%;' });
  }

  if (stage === 'mastery' || ownedItemCount >= 3) {
    items.push({ kind: 'art', label: 'Wall Art', style: 'right: 20%; top: 18%; width: 16%; height: 12%;' });
  }

  return items;
}

function sceneLabel(sceneId, stage) {
  if (sceneId.includes('company')) return 'Company Building Corner';
  if (sceneId.includes('office')) return 'Focused Workstation';
  if (stage === 'mastery') return 'Upgraded Personal Suite';
  if (stage === 'building') return 'Growing Rental Room';
  return 'Starter Rental Room';
}

function sceneCopy(stage, isOffice, ownedItemCount) {
  if (isOffice) {
    return `A lightweight 2D office slice now reflects your current growth stage and ${ownedItemCount} owned furnishing signals.`;
  }

  if (stage === 'mastery') {
    return `The room now reads like a stable base: cleaner layout, warmer light, and visible space for future placement systems.`;
  }

  if (stage === 'building') {
    return `This 2D room snapshot shows a clearer floor plan and a few signs of growth before full placement systems arrive.`;
  }

  return `This early shelter now has a readable 2D layout so progression feels spatial before we introduce full scene systems.`;
}
