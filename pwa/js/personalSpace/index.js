import { getLevelInfo } from '../leveling.js';
import { estimateAvailableGold, getTotalGoldForLevel } from './economy.js';
import { loadPersonalSpaceState } from './gameState.js';
import {
  getAvailableSceneOptions,
  getCurrentSpaceStage,
  getNextSpaceUnlock,
  getPrimaryWorkplaceScene,
  getUnlockedSpaceMilestones,
  resolveActiveScene,
} from './unlockRules.js';

export function buildPersonalSpaceViewModel(user) {
  const levelInfo = getLevelInfo(user?.totalXP || 0);
  const personalSpaceState = loadPersonalSpaceState();
  const spentGold = personalSpaceState.spentGold || 0;
  const ownedItems = personalSpaceState.ownedItems || [];
  const placedItems = personalSpaceState.placedItems || [];
  const stage = getCurrentSpaceStage(levelInfo.level);
  const sceneOptions = getAvailableSceneOptions(levelInfo.level);
  const activeScene = resolveActiveScene(levelInfo.level, personalSpaceState.selectedSceneId);
  const activeWorkScene = getPrimaryWorkplaceScene(levelInfo.level);

  return {
    level: levelInfo.level,
    xpInfo: levelInfo,
    gold: {
      totalEarned: getTotalGoldForLevel(levelInfo.level),
      spent: spentGold,
      available: estimateAvailableGold(levelInfo.level, spentGold),
    },
    ownedItems,
    ownedItemCount: ownedItems.length,
    placedItems,
    placedItemCount: placedItems.length,
    stage,
    sceneOptions,
    activeScene,
    activeWorkScene,
    unlockedMilestones: getUnlockedSpaceMilestones(levelInfo.level),
    nextUnlock: getNextSpaceUnlock(levelInfo.level),
    personalSpaceState,
  };
}
