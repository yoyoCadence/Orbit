export const SPACE_UNLOCKS = [
  { level: 1, id: 'rough-room', label: 'Rough rental room', type: 'scene', stage: 'survival' },
  { level: 3, id: 'basic-furniture', label: 'Basic small furniture unlock', type: 'item-tier', stage: 'survival' },
  { level: 5, id: 'plants-and-decor', label: 'Plants / bookshelf / decor unlock', type: 'item-tier', stage: 'building' },
  { level: 8, id: 'upgraded-rental', label: 'Upgraded rental room', type: 'scene', stage: 'building' },
  { level: 10, id: 'company-building', label: 'Company building unlock', type: 'scene', stage: 'building' },
  { level: 12, id: 'office-corner', label: 'First-floor office corner', type: 'scene', stage: 'building' },
  { level: 15, id: 'formal-workstation', label: 'Formal workstation + dual monitors', type: 'scene', stage: 'building' },
  { level: 20, id: 'small-office', label: 'Small second-floor office', type: 'scene', stage: 'mastery' },
  { level: 30, id: 'mid-office', label: 'Mid-tier office', type: 'scene', stage: 'mastery' },
  { level: 40, id: 'manager-room', label: 'High-floor manager room', type: 'scene', stage: 'mastery' },
  { level: 60, id: 'large-office-suite', label: 'Large office space / private meeting area', type: 'scene', stage: 'mastery' },
];

export function getUnlockedSpaceMilestones(level) {
  return SPACE_UNLOCKS.filter(item => level >= item.level);
}

export function getNextSpaceUnlock(level) {
  return SPACE_UNLOCKS.find(item => level < item.level) || null;
}

export function getCurrentSpaceStage(level) {
  if (level >= 20) return 'mastery';
  if (level >= 5) return 'building';
  return 'survival';
}
