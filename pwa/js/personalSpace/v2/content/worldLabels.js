/**
 * AI-202B1 (H1): the one table of names for what the world records, shared by
 * the Home Orbit Window and the full Personal Space page so neither shows raw
 * ledger keys (`depth.ordinary +1`, `main-focus:2026-10-23 +1`, `companion +1`).
 * A module of its own: a SHELL module must not import a new export of another
 * existing SHELL module, which may still be an older cached copy (INFRA-105).
 */

/** The relationship stages, in order: the only copy of the list. */
export const RELATIONSHIP_STAGES = Object.freeze([
  'stranger-observer',
  'familiar',
  'partner',
  'trusted-companion',
]);

export const RELATIONSHIP_STAGE_LABELS = Object.freeze({
  'stranger-observer': '陌生觀察者',
  familiar: '熟悉夥伴',
  partner: '合作夥伴',
  'trusted-companion': '信賴夥伴',
});

export const HIDDEN_STAT_LABELS = Object.freeze({
  discipline: '紀律',
  depth: '深度',
  vitality: '活力',
  order: '秩序',
  courage: '勇氣',
  craft: '技藝',
});

const UNLOCK_LABELS = Object.freeze({
  'formal-workstation': '正式工作站',
});

const REWARD_TYPE_LABELS = Object.freeze({
  gold: '金幣',
  quest_progress: '每日主線任務',
  project_progress: '工作空間進度',
  relationship: '夥伴關係',
});

// Own keys only: 'constructor' or 'toString' must not find Object's members.
function lookup(table, key) {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** The stage's name; an unknown stage is shown as the first one. */
export function relationshipStageLabel(stage) {
  return lookup(RELATIONSHIP_STAGE_LABELS, stage) || RELATIONSHIP_STAGE_LABELS['stranger-observer'];
}

function hiddenStatKey(reward) {
  const key = reward?.metadata?.statKey || reward?.key || reward?.rewardKey || '';
  return String(key).split('.')[0];
}

/** One line for a reward a reveal shows: name, then the signed amount. */
export function formatRewardLine(reward = {}) {
  const rewardType = reward.rewardType;
  const reversed = reward.direction === 'reversed' || reward.metadata?.direction === 'reversed';
  if (rewardType === 'world_unlock') {
    const name = lookup(UNLOCK_LABELS, reward.rewardKey || reward.key) || '新的空間';
    return reversed ? `收回解鎖：${name}` : `解鎖：${name}`;
  }
  const name = rewardType === 'hidden_stat'
    ? lookup(HIDDEN_STAT_LABELS, hiddenStatKey(reward)) || '隱藏能力'
    : lookup(REWARD_TYPE_LABELS, rewardType) || '世界變化';
  const amount = Math.abs(Number(reward.amount) || 0);
  if (!amount) return name;
  return `${name} ${reversed ? '−' : '+'}${amount}`;
}

/** The last world change (`recentWorldChange`), in the same words. */
export function formatWorldChange(change) {
  if (!change) return null;
  if (typeof change !== 'object') return String(change);
  const message = change.label || change.message || change.title || change.summary
    || change.description || change.text;
  if (message) return String(message);
  const key = change.rewardKey || change.key;
  const rewardType = change.metadata?.rewardType
    || (change.type !== 'reward_reversed' ? change.type : null)
    || (Object.hasOwn(HIDDEN_STAT_LABELS, String(key || '').split('.')[0]) ? 'hidden_stat' : null);
  if (!rewardType) return key ? String(key) : null;
  return formatRewardLine({
    rewardType,
    rewardKey: change.rewardKey || change.key,
    metadata: change.metadata,
    amount: change.amount,
    direction: change.metadata?.direction || (Number(change.amount) < 0 ? 'reversed' : 'added'),
  });
}
