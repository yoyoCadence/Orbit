/**
 * AI-204: the single Companion copy table. The Home Orbit Window card, its tap
 * toast, and the full page's card, dock and detail panel all read from here,
 * so the same snapshot always shows the same line and the same name.
 * Copy approved by the user on 2026-10-19 (proposal W-A: the Home card's
 * lines); docs/ai-204-companion-dialogue-proposal.md.
 * AI-202B1 (S1, approved 2026-10-23): the two lines seen most often also have
 * one per relationship stage after the first; the first keeps the W-A line.
 */

export const COMPANION_NAME = 'Orbit 夥伴';

export const COMPANION_DIALOGUE = Object.freeze({
  'companion.project.workspace-upgrade.complete': '工作站完成了。這個房間記得你一路累積的努力。',
  'companion.project.workspace-upgrade.progress': '工作空間改變了，下一個有用的步驟已經看得見。',
  'companion.recovery.completed': '休息也算數。穩定的節奏需要恢復。',
  'companion.session.productive-complete': '這次行動在空間裡留下了痕跡。',
  'companion.momentum.strong': '你最近的節奏很穩，我會繼續陪你前進。',
  'companion.momentum.strong.familiar': '這幾天的節奏很穩，我跟得上你。',
  'companion.momentum.strong.partner': '我們的步調越來越一致了，繼續一起前進。',
  'companion.momentum.strong.trusted-companion': '這份穩定是你一天天建立的，我一直都在。',
  'companion.goal.gentle-reminder': '你選擇的目標還在這裡，準備好時再開始。',
  'companion.momentum.low': '不用急，我們可以從一個清楚的小行動重新開始。',
  'companion.observe': '我會在這裡看著你的空間慢慢成形。',
  'companion.observe.familiar': '我開始熟悉你的節奏了。',
  'companion.observe.partner': '這個空間是我們一天一天累積起來的。',
  'companion.observe.trusted-companion': '你的節奏我很熟悉了，需要時我都在。',
});

/** The line for a dialogue key; an unknown key falls back to `companion.observe`. */
export function getCompanionDialogue(key) {
  return Object.hasOwn(COMPANION_DIALOGUE, key)
    ? COMPANION_DIALOGUE[key]
    : COMPANION_DIALOGUE['companion.observe'];
}
