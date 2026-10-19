/**
 * @vitest-environment jsdom
 */
/**
 * ai204CompanionDialogue.test.js — AI-204B：Companion 只有一份文案表。
 *
 * 修正前首頁小卡（ui/orbitWindow.js）與「空間」完整頁面（pages/personalSpaceV2.js）
 * 各有一份文案，8 個 key 中 7 個文字不同，夥伴名稱也不同（Orbit Guide／Orbit 夥伴）。
 * 使用者 2026-10-19 核准 W-A（首頁小卡版文字）、L2（小卡最多兩行）與「Orbit 夥伴」。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMPANION_DIALOGUE,
  COMPANION_NAME,
  getCompanionDialogue,
} from '../../pwa/js/personalSpace/v2/content/companionDialogue.js';
import { COMPANION_DIALOGUE_INTERACTION_KEYS } from '../../pwa/js/personalSpace/v2/telemetry.js';
import { normalizeOrbitWindowModel } from '../../pwa/js/personalSpace/v2/ui/orbitWindow.js';
import { renderPersonalSpaceV2 } from '../../pwa/js/pages/personalSpaceV2.js';

// jsdom's import.meta.url is not a file: URL; vitest runs from the repo root.
const PWA_JS = join(process.cwd(), 'pwa', 'js') + sep;

// The copy the user approved (proposal W-A).
const APPROVED = {
  'companion.project.workspace-upgrade.complete': '工作站完成了。這個房間記得你一路累積的努力。',
  'companion.project.workspace-upgrade.progress': '工作空間改變了，下一個有用的步驟已經看得見。',
  'companion.recovery.completed': '休息也算數。穩定的節奏需要恢復。',
  'companion.session.productive-complete': '這次行動在空間裡留下了痕跡。',
  'companion.momentum.strong': '你最近的節奏很穩，我會繼續陪你前進。',
  'companion.goal.gentle-reminder': '你選擇的目標還在這裡，準備好時再開始。',
  'companion.momentum.low': '不用急，我們可以從一個清楚的小行動重新開始。',
  'companion.observe': '我會在這裡看著你的空間慢慢成形。',
};

// The full-page lines that W-A replaced; none may survive anywhere.
const RETIRED = [
  '正式工作站完成了。這個空間會記得你為它付出的每一次努力。',
  '工作空間有了變化，下一個有意義的步驟也已經清楚可見。',
  '恢復也算數。適當休息，是能長久前進的一部分。',
  '剛才完成的工作，已經在這個世界留下痕跡。',
  '你最近的節奏很穩定，我會繼續在旁邊陪你一起工作。',
  '不用勉強自己，我們可以從一個清楚的小行動重新開始。',
  '我正在看著這個空間，隨著你的真實努力慢慢改變。',
];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.js') ? [path] : [];
  });
}

describe('AI-204B shared Companion copy table', () => {
  it('holds exactly the approved W-A lines', () => {
    expect({ ...COMPANION_DIALOGUE }).toEqual(APPROVED);
    expect(Object.isFrozen(COMPANION_DIALOGUE)).toBe(true);
    expect(COMPANION_NAME).toBe('Orbit 夥伴');
  });

  it('has the same keys as the telemetry dialogue allowlist', () => {
    expect(Object.keys(COMPANION_DIALOGUE).sort()).toEqual([...COMPANION_DIALOGUE_INTERACTION_KEYS].sort());
  });

  it('covers every dialogue key the Companion engine can emit', () => {
    const engine = readFileSync(join(PWA_JS, 'personalSpace/v2/companionEngine.js'), 'utf8');
    const emitted = new Set(engine.match(/'companion\.[a-z.-]+'/g).map(key => key.slice(1, -1)));
    expect(emitted.size).toBeGreaterThan(0);
    for (const key of emitted) expect(COMPANION_DIALOGUE, key).toHaveProperty([key]);
  });

  it('falls back to the observe line for unknown keys, including inherited names', () => {
    for (const key of [undefined, null, '', 'companion.unknown', 'toString', '__proto__', 'constructor']) {
      expect(getCompanionDialogue(key), String(key)).toBe(APPROVED['companion.observe']);
    }
  });

  it('is the only place in the app that holds the copy or the old names', () => {
    const files = sourceFiles(PWA_JS);
    const holders = line => files.filter(file => readFileSync(file, 'utf8').includes(line));
    for (const line of Object.values(APPROVED)) {
      expect(holders(line).map(file => file.slice(PWA_JS.length).split(sep).join('/')), line)
        .toEqual(['personalSpace/v2/content/companionDialogue.js']);
    }
    for (const line of RETIRED) expect(holders(line), line).toEqual([]);
    // assetRegistry.js is legacy Idle Window data that nothing reads.
    expect(holders('Orbit Guide').map(file => file.slice(PWA_JS.length).split(sep).join('/'))).toEqual(['personalSpace/assetRegistry.js']);
  });
});

describe('AI-204B every surface shows the same line', () => {
  it('the Orbit Window model takes the line and the name from the shared table', () => {
    for (const [key, line] of Object.entries(APPROVED)) {
      const { companion } = normalizeOrbitWindowModel({ companion: { dialogueKey: key } }, 'home-window');
      expect(companion.message).toBe(line);
      expect(companion.label).toBe(COMPANION_NAME);
    }
    expect(normalizeOrbitWindowModel({ companion: { dialogueKey: 'companion.unknown' } }, 'home-window')
      .companion.message).toBe(APPROVED['companion.observe']);
  });

  describe('full page', () => {
    let container;

    beforeEach(() => {
      localStorage.clear();
      container = document.createElement('div');
      document.body.appendChild(container);
      globalThis.IntersectionObserver = class {
        observe() {}
        disconnect() {}
      };
    });

    afterEach(() => {
      delete globalThis.IntersectionObserver;
      localStorage.clear();
      document.body.innerHTML = '';
    });

    it('card, dock and detail panel show the same line and the same name', () => {
      const personalSpaceState = {
        version: 2,
        ownerId: 'user-1',
        worldRevision: 1,
        weather: 'clear',
        economy: { openingGold: 0, earnedGold: 0, spentGold: 0, balanceGold: 0 },
        hiddenStats: {},
        companion: { relationshipStage: 'stranger-observer' },
        activeProject: { id: 'workspace-upgrade', label: 'Workspace Upgrade', progress: 0 },
        inventory: { ownedItems: [] },
        world: { selectedSceneId: 'office-corner', selectedThemeId: 'default', placedItems: [], idleWindowLayouts: {} },
        rewardLedger: [],
        rewardTombstones: [],
        pendingRewardReveals: [],
      };
      const cleanup = renderPersonalSpaceV2(container, {
        user: { id: 'user-1', name: 'Tester', totalXP: 0, newDayHour: 5 },
        coreState: {
          user: { id: 'user-1', name: 'Tester', totalXP: 0, newDayHour: 5 },
          tasks: [],
          dailyPlan: [],
          sessions: [],
        },
        reconcile: () => ({
          state: personalSpaceState,
          reconciliation: { ledger: [], summary: {}, project: personalSpaceState.activeProject },
          ledgerSnapshot: {
            ledger: [],
            summary: {},
            project: personalSpaceState.activeProject,
            wallet: personalSpaceState.economy,
            hiddenStats: personalSpaceState.hiddenStats,
            companion: personalSpaceState.companion,
            pendingRewardReveals: [],
            worldRevision: 1,
          },
        }),
        mountWindow: () => () => {},
        destroyRuntime: () => {},
        effectiveDate: '2026-10-19',
        now: new Date(2026, 9, 19, 9),
      });

      const card = container.querySelector('[data-orbit-companion]');
      const cardLine = card.querySelector('span:last-child').textContent;
      const dockLine = container.querySelector('[data-v2-open-detail="companion"] small').textContent;
      const detail = container.querySelector('[data-v2-detail="companion"]');

      expect(Object.values(APPROVED)).toContain(cardLine);
      expect(dockLine).toBe(cardLine);
      expect(detail.querySelector('p').textContent).toBe(cardLine);
      expect(card.querySelector('strong').textContent).toBe(COMPANION_NAME);
      expect(detail.querySelector('h2').textContent).toBe(COMPANION_NAME);
      cleanup();
    });
  });
});
