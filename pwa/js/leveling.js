// XP & leveling system (pure functions — no side effects)
// xpRequired / getLevelInfo live in engine.js; imported and re-exported here.

import { xpRequired, getLevelInfo } from './engine.js';
export { xpRequired, getLevelInfo };

// ─── Title templates ──────────────────────────────────────────────────────────

export const TITLE_TEMPLATES = {
  rpg: {
    name: 'RPG 冒險者',
    icon: '⚔️',
    tiers: [
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
    ],
  },
  kny: {
    name: '鬼滅之刃',
    icon: '⛩️',
    tiers: [
      // Based on Demon Slayer Corps heavenly stems ranking (天干) + Hashira tier
      [100, '柱（Hashira）'],
      [75,  '甲之隊士・Kinoe'],
      [50,  '乙之隊士・Kinoto'],
      [40,  '丙之隊士・Hinoe'],
      [30,  '丁之隊士・Hinoto'],
      [25,  '戊之隊士・Tsuchinoe'],
      [20,  '己之隊士・Tsuchinoto'],
      [15,  '庚之隊士・Kanoe'],
      [10,  '辛之隊士・Kanoto'],
      [5,   '壬之隊士・Mizunoe'],
      [1,   '癸之隊士・Mizunoto'],
    ],
  },
  business: {
    name: '職場菁英',
    icon: '💼',
    tiers: [
      [100, '執行長（CEO）'],
      [75,  '副總裁（VP）'],
      [50,  '協理 / 總監'],
      [40,  '資深經理'],
      [30,  '經理'],
      [25,  '副理'],
      [20,  '資深專員'],
      [15,  '專員'],
      [10,  '助理'],
      [5,   '初級助理'],
      [1,   '實習生'],
    ],
  },
};

/** Return the tier title for a given level and template key (default: 'rpg'). */
export function getTitle(level, template = 'rpg') {
  const t = TITLE_TEMPLATES[template] || TITLE_TEMPLATES.rpg;
  return (t.tiers.find(([min]) => level >= min) || t.tiers.at(-1))[1];
}

/**
 * Returns the display title considering the user's custom title override and template.
 * Priority: customTitle > template-based title.
 */
export function getDisplayTitle(level, user) {
  if (user?.customTitle) return user.customTitle;
  return getTitle(level, user?.titleTemplate || 'rpg');
}

// Preview table: XP required for next N levels starting from `fromLevel`
export function xpTable(fromLevel, count = 8) {
  const rows = [];
  for (let i = fromLevel; i < fromLevel + count; i++) {
    rows.push({ from: i, to: i + 1, xp: xpRequired(i) });
  }
  return rows;
}
