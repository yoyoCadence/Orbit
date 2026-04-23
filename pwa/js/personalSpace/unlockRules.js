export const SPACE_UNLOCKS = [
  { level: 1, id: 'rough-room', label: 'Starter rental room', type: 'scene', stage: 'survival' },
  { level: 3, id: 'basic-furniture', label: 'Basic small furniture unlock', type: 'item-tier', stage: 'survival' },
  { level: 5, id: 'plants-and-decor', label: 'Plants / bookshelf / decor unlock', type: 'item-tier', stage: 'survival' },
  { level: 8, id: 'upgraded-rental', label: 'Upgraded rental room', type: 'scene', stage: 'survival' },
  { level: 10, id: 'company-building', label: 'Company building access', type: 'scene', stage: 'building' },
  { level: 12, id: 'office-corner', label: 'First-floor office corner', type: 'scene', stage: 'building' },
  { level: 15, id: 'formal-workstation', label: 'Formal workstation + dual monitors', type: 'scene', stage: 'building' },
  { level: 20, id: 'small-office', label: 'Second-floor small office', type: 'scene', stage: 'building' },
  { level: 30, id: 'mid-office', label: 'Mid-tier upper-floor office', type: 'scene', stage: 'building' },
  { level: 40, id: 'estate-hall', label: 'Estate main hall unlock', type: 'scene', stage: 'mastery' },
  { level: 45, id: 'estate-study', label: 'Estate private study unlock', type: 'scene', stage: 'mastery' },
  { level: 50, id: 'estate-lounge', label: 'Estate grand lounge unlock', type: 'scene', stage: 'mastery' },
  { level: 60, id: 'estate-game-room', label: 'Estate game room unlock', type: 'scene', stage: 'mastery' },
  { level: 40, id: 'manager-room', label: 'High-floor executive office', type: 'scene', stage: 'mastery' },
  { level: 60, id: 'large-office-suite', label: 'Large office suite / private meeting area', type: 'scene', stage: 'mastery' },
  { level: 80, id: 'buy-back-rental', label: 'Buy back the first rental room', type: 'memory-scene', stage: 'mastery' },
];

const SCENE_OPTIONS = [
  { id: 'rough-room', label: '租屋處', shortLabel: '租屋處', family: 'rental', role: 'home', minLevel: 1, maxLevel: 7 },
  { id: 'upgraded-rental', label: '升級租屋處', shortLabel: '回租屋', family: 'rental', role: 'home', minLevel: 8, maxLevel: 39 },
  { id: 'office-corner', label: '公司一樓辦公角', shortLabel: '一樓辦公角', family: 'office', role: 'work', minLevel: 10, maxLevel: 14 },
  { id: 'formal-workstation', label: '正式工位', shortLabel: '正式工位', family: 'office', role: 'work', minLevel: 15, maxLevel: 19 },
  { id: 'small-office', label: '二樓小辦公室', shortLabel: '二樓辦公室', family: 'office', role: 'work', minLevel: 20, maxLevel: 29 },
  { id: 'mid-office', label: '中階高樓層辦公室', shortLabel: '高樓層辦公室', family: 'office', role: 'work', minLevel: 30, maxLevel: 39 },
  { id: 'manager-room', label: '高樓層主管室', shortLabel: '主管室', family: 'office', role: 'work', minLevel: 40, maxLevel: 59 },
  { id: 'large-office-suite', label: '大型辦公室 / 私人會議區', shortLabel: '大型辦公室', family: 'office', role: 'work', minLevel: 60 },
  { id: 'estate-hall', label: '豪宅主廳', shortLabel: '豪宅主廳', family: 'estate', role: 'home', minLevel: 40, maxLevel: 44 },
  { id: 'estate-study', label: '豪宅私人書房', shortLabel: '私人書房', family: 'estate', role: 'home', minLevel: 45, maxLevel: 49 },
  { id: 'estate-lounge', label: '豪宅大客廳', shortLabel: '大客廳', family: 'estate', role: 'home', minLevel: 50, maxLevel: 59 },
  { id: 'estate-game-room', label: '豪宅遊戲房', shortLabel: '遊戲房', family: 'estate', role: 'home', minLevel: 60 },
  { id: 'buy-back-rental', label: '買回最初租屋處', shortLabel: '最初租屋處', family: 'rental', role: 'home', minLevel: 80, memoryProperty: true },
];

export function getUnlockedSpaceMilestones(level) {
  return SPACE_UNLOCKS.filter(item => level >= item.level);
}

export function getNextSpaceUnlock(level) {
  return SPACE_UNLOCKS.find(item => level < item.level) || null;
}

export function getCurrentSpaceStage(level) {
  if (level >= 40) return 'mastery';
  if (level >= 10) return 'building';
  return 'survival';
}

export function getAvailableSceneOptions(level) {
  const stage = getCurrentSpaceStage(level);

  if (stage === 'survival') {
    return [getPrimaryResidenceScene(level)].filter(Boolean);
  }

  if (stage === 'building') {
    return [
      getPrimaryResidenceScene(level),
      ...getUnlockedWorkplaceScenes(level),
    ].filter(Boolean);
  }

  return [
    getPrimaryResidenceScene(level),
    ...getUnlockedWorkplaceScenes(level),
    ...getUnlockedMemoryScenes(level),
  ].filter(Boolean);
}

export function getPrimaryResidenceScene(level) {
  const stage = getCurrentSpaceStage(level);

  if (stage === 'mastery') {
    return getHighestUnlockedScene(level, option => option.family === 'estate' && option.role === 'home');
  }

  return getHighestUnlockedScene(level, option => option.family === 'rental' && option.role === 'home');
}

export function getPrimaryWorkplaceScene(level) {
  return getHighestUnlockedScene(level, option => option.family === 'office' && option.role === 'work');
}

export function getUnlockedWorkplaceScenes(level) {
  return SCENE_OPTIONS
    .filter(option => option.family === 'office' && option.role === 'work')
    .filter(option => level >= option.minLevel);
}

export function getUnlockedMemoryScenes(level) {
  return SCENE_OPTIONS
    .filter(option => option.memoryProperty)
    .filter(option => level >= option.minLevel);
}

export function resolveActiveScene(level, selectedSceneId) {
  const options = getAvailableSceneOptions(level);
  const selected = options.find(option => option.id === selectedSceneId);

  if (selected) return selected;

  const stage = getCurrentSpaceStage(level);
  if (stage === 'building') return getPrimaryWorkplaceScene(level) || options[0] || null;
  if (stage === 'mastery') return getPrimaryResidenceScene(level) || options[0] || null;
  return getPrimaryResidenceScene(level) || options[0] || null;
}

function getHighestUnlockedScene(level, predicate) {
  return SCENE_OPTIONS
    .filter(option => level >= option.minLevel)
    .filter(option => option.maxLevel == null || level <= option.maxLevel || option.family !== 'rental')
    .filter(predicate)
    .at(-1) || null;
}
