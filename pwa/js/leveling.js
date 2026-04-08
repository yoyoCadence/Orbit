// XP & leveling system (pure functions — no side effects)

/**
 * XP needed to advance FROM `level` TO `level + 1`
 * Level 1–30 (新手期): flat 100 XP → 1 default task = 1 level up
 * Level 31+  (成長期): exponential curve
 */
export function xpRequired(level) {
  if (level <= 30) return 100;
  return Math.floor(100 * Math.pow(level - 29, 1.8));
}

/**
 * Given total accumulated XP, return current level info
 */
export function getLevelInfo(totalXP) {
  let level = 1;
  let remaining = Math.max(0, totalXP);
  while (remaining >= xpRequired(level)) {
    remaining -= xpRequired(level);
    level++;
  }
  const needed = xpRequired(level);
  return {
    level,
    currentXP: remaining,
    needed,
    percent: Math.round((remaining / needed) * 100),
    totalXP,
  };
}

// RPG-style level titles
const TITLES = [
  [100, '超越者'],
  [75,  '神話境界'],
  [50,  '傳說強者'],
  [40,  '頂尖大師'],
  [30,  '精通者'],
  [25,  '菁英'],
  [20,  '勇者'],
  [15,  '挑戰者'],
  [10,  '修行者'],
  [5,   '探索者'],
  [1,   '初心者'],
];

export function getTitle(level) {
  return (TITLES.find(([min]) => level >= min) || TITLES.at(-1))[1];
}

// Preview table: XP required for next N levels starting from `fromLevel`
export function xpTable(fromLevel, count = 8) {
  const rows = [];
  for (let i = fromLevel; i < fromLevel + count; i++) {
    rows.push({ from: i, to: i + 1, xp: xpRequired(i) });
  }
  return rows;
}
