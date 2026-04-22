import { getLevelInfo } from '../leveling.js';
import { estimateAvailableGold, getTotalGoldForLevel } from './economy.js';
import { loadPersonalSpaceState } from './gameState.js';
import { getCurrentSpaceStage, getNextSpaceUnlock, getUnlockedSpaceMilestones } from './unlockRules.js';

export function buildPersonalSpaceViewModel(user) {
  const levelInfo = getLevelInfo(user?.totalXP || 0);
  const personalSpaceState = loadPersonalSpaceState();
  const spentGold = personalSpaceState.spentGold || 0;
  const ownedItems = personalSpaceState.ownedItems || [];

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
    stage: getCurrentSpaceStage(levelInfo.level),
    unlockedMilestones: getUnlockedSpaceMilestones(levelInfo.level),
    nextUnlock: getNextSpaceUnlock(levelInfo.level),
    personalSpaceState,
  };
}
