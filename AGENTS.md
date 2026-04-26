# AGENTS.md

This file is the shared collaboration contract for Codex, Claude Code, and human contributors working on Orbit.

## 1. Project Positioning

Orbit is a self-growth product that is evolving from a task-and-check-in PWA into a self-growth life sim.

Orbit is:

- a behavior-to-growth system
- a product that visualizes growth through space, atmosphere, and character response
- a PWA-first app that should remain usable on mobile today

Orbit is not:

- a generic todo app
- a place to sell raw power, XP, or numeric advantage
- a sandbox for uncoordinated tech-stack rewrites

## 2. Architecture Philosophy

Contributors should preserve these principles:

- Keep the Vanilla JS architecture unless explicitly directed otherwise.
- New modules should be loosely coupled and easy to remove or evolve.
- Follow PWA first, hybrid ready.
- Build the parent architecture first, then add large features.
- Keep future 3D systems isolated from current core progression logic.

## 3. High-Risk Change Rules

The following areas require proposal and approval before modification:

- auth
- tokens, secrets, `.env`, or auth flow
- database schema or migrations
- deployment, CI/CD, or GitHub Pages behavior
- destructive changes to existing config

Do not modify these areas casually while implementing unrelated product work.

## 4. Low-Risk Changes That Can Be Done Directly

The following are generally safe to implement directly:

- README and documentation improvements
- new standalone module skeletons
- tests
- low-coupling UI and page skeletons
- placeholder-only frontend features
- platform adapter placeholders

## 5. Change Requirements

Every substantial change should make these clear:

- what changed
- why this change was made
- what risks remain
- what the next recommended step is

The goal is handoff clarity, not just code delivery.

## 6. Prohibited Behaviors

Do not:

- silently replace the main frontend stack
- turn the repo into multiple conflicting architectural styles
- mix a feature task with broad unrelated cleanup
- let 3D or scene code pollute current task, auth, or storage core logic
- sneak in schema, auth, or deployment edits under an unrelated feature

## 7. Expansion Directions

The preferred extension seams for upcoming work are:

- `pwa/js/personalSpace/`
- AI companion systems
- `pwa/js/platform/` adapters
- future hybrid or native shell integration

When possible, extend those seams instead of modifying core files broadly.

## 8. Handoff Friendliness

Documentation and code should be written so another agent or human can continue without relying on private memory or one-off chat context.

That means:

- write module responsibilities clearly
- keep comments focused and actionable
- make placeholders explicit
- prefer obvious extension points over clever shortcuts

## 9. Product Philosophy Reminder

When making product-facing decisions, favor this order:

1. Protect growth meaning.
2. Make growth visible in the world.
3. Preserve long-term extensibility.
4. Avoid destabilizing the current PWA.

Orbit should grow into a world people inhabit, not just a dashboard they glance at.

## 10. Canonical Baseline and Editing Rules

All changes must treat the current repository content as the canonical baseline.

Required behavior:

- Preserve existing language, structure, and major content unless explicitly instructed otherwise
- Prefer additive edits over rewrites
- Do NOT replace entire files (especially README) unless explicitly requested
- Do NOT reorganize large sections of documentation without clear instruction
- When improving documentation, extend existing sections instead of rebuilding them

Chinese clarification:

- 以 repo 現有內容為基準版本（canonical baseline）
- 以「增補」為主，不以「重寫」為主
- 未經明確指示，不得整份改寫 README 或主要文件
- 修改文件時應延續原有結構，而非重新設計整體架構

## 11. Scope Control Rules

Agents must strictly limit changes to the requested scope.

Do NOT:

- Refactor unrelated files "while you are here"
- Rename or restructure directories outside the task scope
- Modify styling, formatting, or naming conventions globally without instruction

If improvement is detected outside scope:

- Propose it instead of implementing it

## 12. Execution Modes

Agents must operate in one of two modes:

### Mode A: Planning / Architecture
- analyze
- propose structure
- outline changes
- DO NOT modify files yet

### Mode B: Implementation
- apply changes strictly based on agreed plan
- avoid introducing new design decisions

If unclear, default to Mode A first.

## 13. Documentation Synchronization

For meaningful changes, documentation should be kept in sync.

### Changelog
Update CHANGELOG.md when:
- user-facing behavior changes
- new features are added
- core logic is modified

Do NOT update for:
- internal refactoring
- comments or documentation-only edits

### Roadmap
Update roadmap.md when:
- feature status changes (planned → in progress → done)
- priorities shift
- major new directions are introduced

Do NOT:
- rewrite roadmap structure
- remove items without explicit instruction


## 14. Task Lifecycle

Tasks must move through the following states:

Backlog → Next → In Progress → Done

Rules:
- Do not start a task that is not in Next or In Progress
- Move task to In Progress before implementation
- Move to Done only when completed
- Do not silently skip or reorder tasks

## 15. Task Granularity Rule

Tasks must be:

- small enough to complete in one session
- clear enough that no interpretation is needed
- independent enough to not require large refactors

Avoid:
- "implement system"
- "build feature"
- "add 3D"

## 16. Personal Space Development Reference

### Module Responsibilities

| 模組 | 職責 |
|------|------|
| `personalSpace/index.js` | `buildPersonalSpaceViewModel(user)` — 組合所有資料給頁面用 |
| `personalSpace/unlockRules.js` | scene/stage unlock 邏輯、MEMORY_PROPERTY_RULES、`getSceneMinLevel` |
| `personalSpace/gameState.js` | localStorage 讀寫、normalize、`recordMemorySceneVisit` |
| `personalSpace/economy.js` | Gold 估算 |
| `personalSpace/sceneRuntime.js` | 場景 2D 渲染 runtime |
| `personalSpace/world/floorMap.js` | 公司 / 豪宅建築拓樸資料（buildings / floors / rooms / sceneIds） |
| `personalSpace/ui/floorMapPanel.js` | 地圖視窗 HTML 渲染（樓層漸進揭露、badge、可點房間） |
| `pages/personalSpace.js` | 頁面事件處理：場景切換器、地圖視窗點擊、interaction bus |

### Key State Fields

- `selectedSceneId` — 玩家選擇的主場景（非 memory scene）
- `memoryViewSceneId` — 玩家明確導航到的回顧場景（null = 不在回顧模式）
- `ownedItems` — 購買的家具/物件
- `placedItems` — 各場景的擺放資料
- `memorySceneLog` — 各 memory scene 的首次造訪時間

### 測試時切換玩家等級（DevTools Console）

```js
// 修改 totalXP 來模擬不同等級（參考 pwa/js/leveling.js 計算對應 XP）
const u = JSON.parse(localStorage.getItem('yoyo_user'));
u.totalXP = 2000;   // 約 Lv.10（公司建設期開始）
// u.totalXP = 8000;  // 約 Lv.20（二樓辦公室）
// u.totalXP = 25000; // 約 Lv.40（掌控期，豪宅解鎖）
localStorage.setItem('yoyo_user', JSON.stringify(u));
location.reload();
```

### 測試時重置個人空間本地狀態

```js
localStorage.removeItem('orbit_personal-space-state');
location.reload();
```
