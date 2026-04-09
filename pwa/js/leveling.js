// XP & leveling system (pure functions — no side effects)
// xpRequired / getLevelInfo live in engine.js; imported and re-exported here.

import { xpRequired, getLevelInfo } from './engine.js';
export { xpRequired, getLevelInfo };

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
