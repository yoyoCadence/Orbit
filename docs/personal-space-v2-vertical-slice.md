# Personal Space V2 Vertical Slice Delivery Plan

## Document status

- Task: `PS-233`
- Repository baseline: Orbit `v1.20.6`
- Scope: delivery contract for the first Personal Space V2 vertical slice
- Runtime target: current Vanilla JavaScript PWA, with PixiJS 8 introduced only after the runtime spike passes
- Persistence target for the first slice: local-first, deterministic, versioned, and reconcilable from existing Session data
- High-risk boundary: auth, Supabase schema, migrations, deployment, and CI changes require a separate proposal and explicit approval

This document does not authorize implementation by itself. It defines the sequence, state contracts, acceptance criteria, and file-level handoff for tasks `PS-234` through `PS-240`.

## 1. Corrected product promise

The vertical slice must prove one complete loop:

```text
real-world action
-> existing Session settlement
-> deterministic game rewards
-> reversible Reward Ledger
-> Workspace Upgrade progresses
-> the home Orbit Window changes immediately
-> protagonist and Companion react
-> the next concrete goal is visible
```

The home Orbit Window is not a thumbnail, advertisement, optional shortcut, or later phase. It is the primary reward surface for ordinary use. A user must not need to open the full Personal Space page to see the main result of completing a task.

The slice is complete only when all of these ship together:

```text
Home Orbit Window
+ Full Personal Space World Mode
+ Minimal Edit Mode
+ Reward Ledger
+ Active Project
+ Companion Reaction
```

## 2. Repository-grounded baseline

The plan preserves these working seams:

- `pwa/js/sessionFlow.js` is the single settlement path for Instant and Focus Sessions.
- `pwa/js/engine.js` remains the authority for XP, Energy formulas, effective-day rules, streak multipliers, and Level derivation.
- `pwa/js/state.js` remains the current in-memory core state for user, tasks, sessions, energy, and Daily Plan.
- `pwa/js/storage.js` remains the localStorage-first core persistence and Supabase background-sync boundary.
- `pwa/js/personalSpace/gameState.js` already preserves `ownedItems`, `placedItems`, `idleWindowLayouts`, scene selection, `hiddenStats`, and `companionRelationshipStage`.
- `pwa/js/personalSpace/index.js`, `unlockRules.js`, `sceneRuntime.js`, `world/`, `idleWindow/`, and the asset registries remain reusable.
- `pwa/js/timeBand.js` remains the shared source for time-of-day atmosphere.
- The current hash router, Service Worker, Focus Timer, proof system, and PWA shell remain intact.

The implementation must account for these observed gaps rather than assuming they are already solved:

- `commitSession()` has no game-event hook or duplicate settlement guard.
- Session undo reverses only XP and nominal Energy values; it does not reverse Personal Space rewards.
- Session, profile, and Energy writes are independent asynchronous operations rather than one transaction.
- Remote/local Session merge has no durable deletion tombstone, so an offline failed deletion can reappear on reload.
- Personal Space state is local-only, unscoped by user, and is not cleared by the current `storage.clearAll()` path.
- Gold is currently recomputed from Level and local `spentGold`; there is no earned-Gold transaction history.
- The starter shop emits a purchase request but has no production purchase settlement handler.
- Active Project, Daily Main Quest, Momentum, Reward Ledger, pending reveal, and shared world state do not exist yet.
- Companion behavior and dialogue modules are placeholders. The page currently ignores non-scene-change Companion actions.
- `renderHome()` replaces its DOM on every settlement, so an Orbit Window runtime needs an explicit lifecycle rather than mounting blindly on every render.
- Current tests do not execute `commitSession()` and `deleteSession()` directly.

## 3. Mandatory vertical-slice user flow

The exact acceptance flow is:

```text
1. User enters Home.
2. Home shows the Orbit Window in the core content area.
3. The Window shows the Building-stage formal workstation,
   Workspace Upgrade progress, protagonist, Companion, Main Quest,
   recent world change, and any pending reveal.
4. User starts the Main Quest from Home.
5. User completes a qualifying 25-minute-or-longer A/S task Session.
6. Existing XP and Energy settlement completes.
7. The V2 reward reconciler settles one reward batch for the Session.
8. The Reward Ledger records traceable Gold, hidden-stat, quest,
   project, and any world/relationship rewards exactly once.
9. Workspace Upgrade advances by one 25% phase.
10. Without navigating away from Home, the Orbit Window plays the reward:
    protagonist action, Companion reaction, numeric summary, and scene change.
11. The Window returns to an operable state and shows the next requirement.
12. User opens the full Personal Space from the Window.
13. Full World Mode shows the same project, Companion, scene phase,
    recent change, wallet, and next requirement.
14. User returns Home; both presentations still agree.
15. User reloads; the same world state remains and no reward is duplicated.
16. Repeated remote Session reload/reconciliation does not duplicate rewards.
17. User undoes the source Session.
18. Ledger entries are marked reversed, Project/Quest/Gold/hidden stats roll back,
    and Home plus Full World display the same rolled-back state.
```

If only the full Personal Space page is implemented, the vertical slice is not complete.

## 4. Vertical-slice content

### 4.1 Scene and project

The only production scene required for the slice is:

```text
Building Stage: Formal Workstation
```

The only Active Project is `workspace-upgrade-v1`:

| Progress | Project phase | Required visible state |
|---:|---|---|
| 0% | Empty work corner | sparse corner, project marker, basic ambient light |
| 25% | Basic desk | desk appears and becomes an interaction anchor |
| 50% | Light and storage | task light and storage layer appear |
| 75% | Monitor and planning board | single monitor and planning board appear |
| 100% | Formal workstation | dual-monitor formal workstation and completion interaction appear |

Only these five discrete states are required. Progress must not require one hundred art variants.

The slice requires:

- one canonical 3/4 illustrated room camera
- one window background seam
- daytime and nighttime lighting overlays
- 8 to 12 approved furniture/prop assets
- one protagonist with `idle`, `work`, `celebrate`, `rest`, `walk`, and `inspect`
- one Companion with at least `idle`, `approach`, `congratulate`, and `rest`
- two bounded weather effects
- 8 to 10 interaction descriptors, of which only the highest-value subset needs production behavior in the slice
- static poster/fallback assets that communicate the same project phase as the runtime

Existing ownership, placement, support-surface, anchor, scene-unlock, and memory-scene data must be preserved. V2 may adapt them but must not discard or rewrite valid legacy data.

### 4.2 Main Quest

The first Main Quest is deterministic and uses fields already persisted on a Session:

```text
Complete one non-invalid A/S task Session lasting at least 25 minutes.
```

Eligibility:

```js
session.result === 'complete'
&& session.impactType === 'task'
&& (session.value === 'A' || session.value === 'S')
&& session.durationMinutes >= 25
```

The quest identity is `main-focus:<effective-date>`. At most one Session can own its completion reward for a date. If more than one Session qualifies, the canonical source is the earliest `completedAt`, with `session.id` as the tie-breaker.

If the canonical source is undone while another Session still qualifies, reconciliation reverses the old source entries, assigns the quest to the next canonical source, and preserves the net daily completion. If no qualifying Session remains, all quest-dependent rewards reverse.

The Home CTA selects the first matching task from the current Daily Plan, then the first matching available task. If no task can satisfy the quest, the CTA explains the requirement and routes to the existing task-creation surface; it never blocks normal task completion.

Side Quests, a Recovery Objective, and Weekly Contracts remain reserved extension points and are not production systems in this slice.

### 4.3 Fixed reward table

Existing XP and Energy remain owned by `sessionFlow.js` and `engine.js`. V2 displays `session.finalXP` but must not grant XP a second time.

For the first ruleset, `ps-v2-workspace-v1`:

| Trigger | Ledger rewards | Reveal class |
|---|---|---|
| Valid ordinary productive Session | one primary hidden-stat reward from the mapping below | Small |
| Daily Main Quest first completion | `gold:daily-main=100`, `hidden_stat:depth=3`, `quest_progress:main-focus:<effective-date>=1`, `project_progress:workspace-upgrade=25` | Medium |
| Workspace Upgrade reaches 100% | `world_unlock:formal-workstation=1`, `relationship:companion-stage=1` | Major |

Ordinary low-value completions do not drop Gold. Gold is fixed, non-random, and tied to an understandable source.

For a valid Session that did not receive the Main Quest Depth reward, choose exactly one primary hidden stat using this priority:

| Priority | Deterministic condition | Reward |
|---:|---|---|
| 1 | recovery Session, non-invalid, at least 30 minutes | `vitality +2` |
| 2 | productive task with `value === 'S'` or `resistance >= 1.4` | `courage +2` |
| 3 | productive task lasting at least 25 minutes | `depth +1` |
| 4 | productive maintenance or obligation task | `order +1` |
| 5 | other productive growth task | `craft +1` |
| 6 | other productive task | `discipline +1` |

Invalid Sessions produce no game reward. Proof-dependent `craft` bonuses require a later proof-attached game event because proof is currently added after Session settlement; they are not inferred retroactively in this slice.

### 4.4 Gold transition

V2 must stop treating newly earned Gold as a continuously recomputed side effect of current Level.

At the one-time V1-to-V2 migration:

```text
openingGold = max(0, legacy cumulative level Gold - legacy spentGold)
```

The migration records that opening amount once. After the V2 reward epoch, wallet balance is:

```text
openingGold
+ sum(active Gold reward ledger entries)
- sum(completed V2 purchase transactions)
```

The first slice does not need a new production purchase economy. It preserves existing `ownedItems`, `placedItems`, and legacy purchases. A V2 purchase transaction must not be added until the existing request-only shop is given its own idempotent settlement and reversal contract.

Undoing a qualifying Session reverses its active Gold ledger entry. It does not delete or silently repossess a legacy owned item. If a later purchase system would make a reversal produce insufficient balance, that future system must define debt or purchase-reversal policy before shipping.

## 5. One canonical state, three presentations

Home, full World Mode, and Edit Mode derive from one persisted V2 state:

```text
Personal Space V2 persisted state
             |
             +--> Home Orbit Window View Model
             +--> Full World View Model
             +--> Edit Mode View Model
```

Presentation modes are:

```js
renderMode: 'home-window' | 'full-world' | 'edit'
```

View models are pure reads. They may not write Project progress, Companion state, pending rewards, wallet balance, or world state. All mutations pass through:

```text
Game Event
-> Reward/Reconciliation rules
-> append or reverse Ledger entries
-> World reducer
-> persisted V2 state
-> pure View Model
```

### 5.1 V2 state envelope

The exact implementation can split storage across modules, but the normalized logical envelope must provide these fields:

```js
{
  version: 2,
  ownerKey,
  rulesetId: 'ps-v2-workspace-v1',
  rewardEpoch,
  migratedAt,
  legacy: {
    spentGold,
    ownedItems,
    placedItems,
    idleWindowLayouts,
    selectedSceneId,
    memoryViewSceneId,
    selectedThemeId,
    memorySceneLog
  },
  wallet: {
    openingGold
  },
  ledger: [],
  sessionTombstones: {},
  projects: {
    activeProjectId: 'workspace-upgrade-v1'
  },
  world: {
    recentWorldChange,
    revealQueue: [],
    selectedSceneId,
    protagonistState,
    companionRelationshipStage,
    presentationPreferences
  },
  reconciliation: {
    lastRunAt,
    lastSessionFingerprint,
    stateRevision
  }
}
```

Project progress, quest completion, hidden stats, V2 Gold, relationship advancement, and unlocked project phases are reduced from active ledger entries. A persisted derived snapshot may be used for fast rendering, but reconciliation must be able to rebuild and verify it from the ledger.

### 5.2 Ownership and migration scope

The current unscoped `personal-space-state` key must remain readable by legacy mode. V2 writes to an owner-scoped key derived from the existing user id; it must not modify auth behavior.

Migration rules:

1. Read but do not delete the V1 state.
2. If no scoped V2 state exists, claim one V1 snapshot for the current `ownerKey`.
3. Preserve owned items, placements, idle-window overrides, selected scenes, theme, memory log, hidden stats, and relationship stage.
4. Record opening Gold once.
5. Use a fixed UTC ruleset activation epoch, not device-local `Date.now()`, to avoid retroactive rewards and cross-device epoch disagreement.
6. Do not create reward entries for pre-epoch Sessions during migration.
7. Re-running migration returns byte-equivalent domain state except for explicitly non-semantic audit timestamps.
8. Invalid or unknown V1 fields fall back without destroying the original value.
9. `legacy` runtime selection continues to read the existing V1 path.
10. Switching users cannot expose another user's scoped V2 state.

Guest-to-account claiming, multi-device legacy furniture continuity, or cloud V2 state requires a separately approved product and persistence decision. The local-first slice must state this limitation in its release notes.

## 6. Reward Ledger and deterministic reconciliation

### 6.1 Ledger record

Each immutable reward entry uses a deterministic identity:

```js
{
  id: `reward:${rulesetId}:${sourceId}:${rewardType}:${rewardKey}`,
  rulesetId,
  sourceType: 'session',
  sourceId: session.id,
  sourceFingerprint,
  rewardType:
    'hidden_stat'
    | 'gold'
    | 'quest_progress'
    | 'project_progress'
    | 'world_unlock'
    | 'relationship',
  rewardKey,
  amount,
  metadata,
  createdAt: session.completedAt,
  reversedAt: null,
  reversalReason: null
}
```

The unique semantic key is:

```text
rulesetId + sourceType + sourceId + rewardType + rewardKey
```

`rewardKey` identifies the immutable grant variant, not only the destination
domain field. For example, ordinary `depth +1` and Daily Main Quest `depth +3`
use distinct hidden-stat reward keys while both carry `metadata.statKey =
'depth'`. Daily quest progress uses `main-focus:<effective-date>`. This keeps a
Session promotion or winner reassignment from mutating an existing ledger
record in place.

No random id or current timestamp may decide whether a reward is new. Amount and metadata are immutable for a ruleset. Changing a rule requires a new `rulesetId` plus an explicit migration/reconciliation policy.

### 6.2 Reconciliation algorithm

Reconciliation is a pure calculation followed by one local state write:

1. Normalize and deduplicate Sessions by `session.id`.
2. Exclude durable local deletion tombstones.
3. Ignore Sessions before the fixed reward epoch.
4. Sort by `completedAt`, then `session.id`.
5. Generate the complete expected reward set for the current ruleset.
6. Add only missing deterministic ledger ids.
7. Mark no-longer-expected active entries as reversed; never delete their audit record.
8. If a previously reversed source becomes valid only because a failed remote deletion resurfaced, the tombstone still wins and the reward remains reversed.
9. Reduce Project, Quest, wallet, hidden stats, relationship, and world phase from active entries.
10. Persist the new envelope once.
11. Queue an animation only for a live local settlement or a still-unconsumed reveal; boot reconciliation must not replay all historical rewards.

Conflicting duplicate Session payloads fail closed and are reduced to one
deterministic record before winner selection. For a non-authoritative partial
snapshot, absence is not proof of deletion: omitted prior rewards remain active.
If an omitted active winner already owns `main-focus:<date>`, a newly visible
same-date candidate receives only its ordinary reward rather than a second daily
bundle.

The reconciler runs:

- after a local Session commit has been written
- after a local Session undo and tombstone write
- after boot state load
- after remote Session load/merge
- after migration
- when V2 is enabled after being disabled

Repeated execution with unchanged Sessions and rules produces no state or reward change.

### 6.3 Commit ordering and crash recovery

The local-first order is:

```text
existing Session local write
-> existing XP/Energy local write
-> V2 reconcile and one V2-state write
-> render/reveal
-> independent background sync
```

If the app closes after the Session write but before the V2 write, boot reconciliation creates the missing ledger entries once. If it closes after the V2 write but before animation, the persisted reveal remains consumable. If it closes after animation consumption, the reveal does not replay.

### 6.4 Undo and deletion tombstones

Undo must write a durable local Session deletion tombstone before relying on the remote delete. Remote merge must filter tombstoned ids and retry deletion until Supabase confirms success. A failed/no-session delete must not silently clear the tombstone.

The deletion entry is also a recovery journal. Before canonical mutation it
stores the target XP and Energy values. Boot reapplies those absolute targets
only while the entry is locally unsettled, removes the source Session, then
checkpoints local settlement. Remote confirmation is recorded separately and
the entry is cleared only after the V2 reversal is persisted. Owner-scoped
profile/Energy pending snapshots are pushed before a later remote pull and
survive sign-out for that owner.

Undo order:

```text
confirm undo
-> write tombstone
-> remove Session locally
-> existing XP/Energy reversal
-> reconcile expected game rewards
-> mark source ledger entries reversed
-> derive rolled-back Project/Quest/world state
-> rerender Home/full view
-> retry remote deletion in background
```

The first slice must directly test duplicate commits, repeated reconciliation, offline deletion, remote resurrection attempts, and reversal after reload.

Same-device Energy reversal records the actually applied delta in local-only
Session metadata and is exact at the 0/maximum clamps. Persisting that value
across devices would require an approved Session schema change, so older or
remote-only Sessions retain the nominal compatibility fallback. V2 rewards do
not depend on Energy deltas, and no schema column is added by this slice.

## 7. Momentum and Companion rules

### 7.1 Momentum

Momentum is derived, not manually incremented:

| Effective days in the latest seven effective dates | State |
|---:|---|
| 0-2 | `low` |
| 3-4 | `stable` |
| 5-6 | `strong` |
| 7 | `peak` |

It reuses `calcDailyStats()` and the user's effective-day cutoff. It may affect atmosphere, Companion behavior, and optional project flavor, but it cannot remove furniture, reverse Project progress, or replace strict Streak.

Daily Plan and quest dates must use the same effective date as Sessions. The current calendar-day Daily Plan behavior cannot be used for reward eligibility around the user's `newDayHour` boundary until it is aligned and tested.

### 7.2 Rule-based Companion

The first Companion is fully deterministic. No language model controls rewards, economy, relationship changes, or world state.

Input:

```js
{
  recentSessions,
  dailyStats,
  hiddenStats,
  currentStreak,
  momentum,
  missedPatterns,
  activeProject,
  relationshipStage,
  pendingReveal
}
```

Output:

```js
{
  state: 'observe' | 'approach' | 'remind' | 'congratulate' | 'rest' | 'work',
  dialogueKey,
  animationKey,
  relationshipDelta,
  worldAction
}
```

Priority for the slice:

1. Project completion pending: `congratulate`.
2. Main Quest/Project progress reveal pending: `approach` then `congratulate`.
3. Valid recovery completed: `rest` with a recovery-specific dialogue key.
4. Productive ordinary Session completed: `approach`.
5. Strong/Peak Momentum with no reveal: `work`.
6. Low Momentum: `observe`; a bounded `remind` may be used only when a user-selected goal exists.
7. Otherwise: `observe`.

Relationship stages remain ordered:

```text
stranger-observer -> familiar -> partner -> trusted-companion
```

Completing Workspace Upgrade advances at most one stage through a ledger entry. Reversing the project-completion source reverses that advancement unless a later active source independently sustains it.

Dialogue uses approved keys, never raw generated text. It must describe the observed pattern or Project change without guilt, emotional coercion, or repetitive generic praise.

## 8. Home Orbit Window contract

### 8.1 Placement and content

Home order is:

```text
Header / Today Stats
-> Orbit Window
-> Main Quest / Daily Plan
-> task lists
-> today's Session log
```

The Window is visible on initial Home entry and is not permanently collapsed by default. It may offer a user-controlled compact preference after the full state has first been understandable.

Required content:

- current room and project phase
- protagonist current action
- Companion current state
- Active Project name, percentage, phase, and next requirement
- today's Main Quest and action target
- recent world change
- unconsumed reveal or event indicator

Optional content:

- Momentum
- shared time-band lighting
- bounded weather
- one primary interaction
- one Companion dialogue line

Forbidden on Home:

- furniture dragging or the full editor
- complete inventory, shop, scene list, or unlock history
- placement/debug data
- asset pipeline status
- developer information

### 8.2 View model

```js
{
  sceneId,
  sceneStage,
  playerState,
  companionState,
  activeProject: {
    id,
    label,
    progress,
    currentPhase,
    nextRequirement
  },
  mainQuest: {
    id,
    label,
    progress,
    actionTarget
  },
  recentWorldChange,
  pendingReveal,
  momentum,
  timeBand,
  weather,
  interactables
}
```

The Window view model and full World view model must return the same project progress, relationship stage, Companion state, scene phase, recent change, and wallet revision when built from the same state.

### 8.3 Reward presentation

- Small Reward: 1.5 to 3 seconds inside the Window.
- Medium Reward: 3 to 6 seconds; the Window may expand temporarily without blocking task controls.
- Major Reward: full-screen reveal is allowed only for project completion, important room/chapter unlock, or relationship-stage advancement.

For a qualifying Focus completion, the visible sequence is:

```text
protagonist finishes work
-> completed document/prop appears
-> project phase changes
-> Companion approaches and reacts
-> summary shows existing XP, Depth +3, Gold +100, Workspace +25%
-> next project requirement appears
-> Window returns to idle/operable state
```

Reduced-motion mode replaces travel, particles, shake, and zoom with a short crossfade plus an accessible textual summary.

### 8.4 Loading and failure behavior

Initial Home render always supplies one of:

- phase-correct static poster
- last saved world preview
- skeleton with textual Project/Main Quest state

Interactive runtime starts only after one of these triggers:

- Window enters the viewport
- user interacts with it
- a live Session is about to settle
- browser idle time is available

Use `IntersectionObserver`, `requestIdleCallback` fallback, and dynamic import. Pixi failure, WebGL context loss, asset failure, or slow initialization leaves the DOM controls and static state usable. Task selection, Focus, Session settlement, and undo must never depend on Pixi initialization.

### 8.5 Responsive contract

- logical scene: `960 x 640`
- source art target: `1920 x 1280`
- primary aspect ratio: `3:2`
- safe composition: protagonist, Companion, project object, and main change stay in the center 80% of both axes
- supported: small/large phones, tablets, narrow/wide desktop, standalone PWA, safe areas, and browser-toolbar height changes

## 9. Full World Mode and minimal Edit Mode

### 9.1 World Mode

World Mode is scene-first, with the scene occupying approximately `55vh` to `65vh` on phones.

Compact HUD:

- Level
- available V2 Gold
- Momentum
- Map
- necessary event indicator

World content:

- same protagonist and Companion state as Home
- same Active Project and next requirement
- contextual interaction nodes
- recent/pending story or reward event

Bottom dock:

```text
Project | Decorate | Collection | Story | Map/More
```

Total earned Gold, spent Gold, item counts, full unlock history, and development explanations move to secondary panels.

### 9.2 Minimal Edit Mode

The slice's Edit Mode may:

- display existing owned items
- move already supported small objects
- apply existing placement anchors and support surfaces
- select the existing theme seam
- save through the same V2 envelope without changing Project or reward state

It does not need a new full purchase economy, arbitrary large-furniture placement, camera switching, or a redesigned inventory. Exiting Edit Mode returns to the same world revision shown on Home.

## 10. Runtime lifecycle and performance budgets

Only one live Pixi Application is permitted. Home and full World share runtime modules and texture cache, not simultaneous Applications.

Required lifecycle:

```text
mount -> suspend -> resume -> destroy
```

Route and visibility behavior:

- Home rerender explicitly unmounts or rebinds the Window before replacing DOM.
- Leaving Home suspends or destroys its runtime before full World mounts.
- Leaving Personal Space destroys route listeners, observers, animation frames, and the Application.
- Off-viewport Window suspends continuous updates within one second.
- `visibilitychange` suspends rendering.
- WebGL context loss moves to static fallback and can recover once without duplicating the Application.
- repeated Home/Personal Space navigation leaves at most one runtime and one listener set.

Performance acceptance is measured on a defined mid-tier Android Chrome profile and reported with device/browser details:

| Budget | Target | Hard fallback threshold |
|---|---:|---:|
| Home poster/text visible after `renderHome()` receives local state | <= 100 ms | 250 ms |
| Additional blocking work on Home critical path | no task > 50 ms | any repeatable > 100 ms fails |
| Lazy runtime ready after trigger, warm cache | <= 800 ms p75 | 2 s then retain fallback |
| Home V2 deferred JS, gzip estimate | <= 300 KB | review before merge |
| Initial Home scene compressed assets | <= 1.5 MB | 2.5 MB |
| Full first scene compressed assets | <= 4 MB | 6 MB |
| Active Home incremental memory | <= 64 MB | 96 MB |
| Active full World incremental memory | <= 96 MB | 128 MB |
| Animation target | 55-60 FPS | below sustained 30 FPS selects low mode |
| Route/runtime teardown | <= 250 ms | 500 ms |

Budgets are not satisfied by hiding slow work behind a loader. Home task controls must be interactive before the runtime is ready.

The Service Worker install shell caches only approved production assets or an explicitly labeled static fallback poster. Phase textures are cached after successful first use. New code/assets are added to cache strategy deliberately, and the project bump script updates the release version/cache once at final release.

Implementation note for the vertical-slice proof: the temporary fallback
background and protagonist poster are the only V2 visual files in the install
shell (about 1.99 MB combined). Pixi and phase-specific props stay lazy and are
stored by the successful-response cache path after first use. This keeps the
synchronous Home surface poster-first and below the 2.5 MB hard fallback
threshold. The 1.5 MB target remains an explicit art-optimization task before
the fallback proof can be promoted to production.

## 11. Telemetry contract

The slice defines these events even if the first implementation uses a local/no-op telemetry adapter:

| Event | Required properties |
|---|---|
| `orbit_window_viewed` | `schemaVersion`, `renderPath`, `projectPhase`, `runtimeReady` |
| `orbit_window_opened` | `schemaVersion`, `entryPoint`, `projectPhase` |
| `personal_space_loaded` | `renderMode`, `renderPath`, `loadMs`, `projectPhase` |
| `reward_reveal_started` | `rewardBatchType`, `revealClass`, `renderMode`, `reducedMotion` |
| `reward_reveal_completed` | previous fields plus `durationMs`, `completionMode` |
| `project_progressed` | `projectId`, `fromPhase`, `toPhase`, `sourceCategory` |
| `project_completed` | `projectId`, `sourceCategory` |
| `companion_interacted` | `companionState`, `interactionKey`, `renderMode` |
| `edit_mode_opened` | `sceneId`, `ownedCountBand` |
| `quest_completed` | `questType`, `effectiveDate`, `sourceCategory` |

Implementation status (2026-07-18): `pwa/js/personalSpace/v2/telemetry.js`
implements this allowlisted contract with local event-id deduplication and a
bounded in-memory adapter for tests/dev inspection. Production defaults to a
no-op adapter; no external analytics provider has been added. The Orbit Window
currently emits view/open, reveal start/complete, Companion interaction, full
space load, and Edit Mode entry events. Project/Quest settlement events remain
contracted extension points until their event-source wiring is separately
validated.

Privacy rules:

- do not send task names, notes, proof media, dialogue text, email, or raw localStorage values
- do not use telemetry as the reward authority
- use a deduplicated local event id for retries
- make telemetry failure a no-op for product behavior
- obtain separate approval before adding or changing an external analytics provider

Validation metrics include Window click-through, reveal completion, full-space entry after reward, project comprehension, return rate, runtime load time, FPS/memory, and whether decoration displaces real task completion.

## 12. Delivery phases

### PS-234: Feature flag and state migration

Deliver:

- `personalSpaceRuntime: 'legacy' | 'v2'`
- owner-scoped V2 envelope
- fixed reward epoch and ruleset id
- idempotent V1-to-V2 migration
- legacy fallback and invalid-data normalization
- cross-user isolation tests

Exit gate: switching either mode preserves legacy state and never rewards during migration.

### PS-235: Reward and Project foundation

Deliver:

- game-event/session adapter
- deterministic reward generation
- immutable ledger and reconciliation
- durable deletion tombstones
- hidden-stat rules
- V2 Gold opening balance and daily reward
- Main Quest and Workspace Upgrade reducers
- exact reversal and duplicate protection
- same-device applied-Energy-delta decision documented or implemented without schema changes

Exit gate: commit, duplicate commit, reload, repeated remote reconciliation, offline undo, and project completion/reversal produce one correct state.

### PS-236: Shared world and presentation models

Deliver:

- derived Momentum
- rule-based Companion engine
- protagonist state selector
- recent world change and persisted reveal queue
- pure `home-window`, `full-world`, and `edit` view models
- time-band and bounded weather selectors

Exit gate: all three models agree on canonical world fields and cannot mutate state.

### PS-237: Mandatory Home Orbit Window

Deliver:

- core Home placement
- 3:2 poster-first surface
- Main Quest/Project/Companion interactions
- live Small/Medium reward presentation
- lazy Pixi runtime spike and static failure path
- reduced-motion and accessible text path
- Home rerender cleanup

PixiJS may be added here only after the spike demonstrates mount/destroy, resize, fallback, and the budgets above. The dependency addition must be explained before installation.

Exit gate: Instant and Focus completion feedback appears on Home without requiring Personal Space navigation, while tasks work before and after runtime failure.

### PS-238: Full World Mode and minimal Edit Mode

Deliver:

- scene-first full page behind V2 flag
- compact HUD and dock
- shared Project/Companion/reveal state
- minimal placement reuse in a clearly separate Edit Mode
- legacy page preserved behind legacy flag

Exit gate: Home/full/edit show one world revision; edits affect placement only.

### PS-239: Runtime, cache, and fallback hardening

Deliver:

- shared runtime manager
- single-Application guarantee
- suspend/resume/destroy and route cleanup
- visibility/off-viewport throttling
- texture cache policy
- context/asset failure recovery
- Service Worker asset coverage
- measured mobile performance report

Exit gate: repeated route loops leak no Application/listener and never block task functionality.

### PS-240: Validation and release handoff

Deliver:

- complete integration/E2E flow
- accessibility and reduced-motion verification
- performance budget results
- updated task status, roadmap where status changed, and changelog
- one `npm run bump -- minor` after all slice changes are ready; do not hand-edit versions
- lint, unit/integration, and E2E results
- documented remaining cloud-sync limitations and approval-gated next work

Exit gate: every acceptance item in this document passes in V2 mode and legacy mode has no regression.

#### PS-240 pre-merge verification checklist

Automated coverage completed by the implementation:

- [x] stale owner remote loads cannot write shared cache after account switch
- [x] owner-bound profile, task, Session, Energy, and trial mutations reject a mismatched session
- [x] same-route Home redraw cancels deferred Pixi teardown and reuses the Application
- [x] Small, Medium, and Major reveal clocks are distinct and pause off-screen or in a hidden tab
- [x] protagonist, Companion, and rain state reach both poster and Pixi render paths
- [x] telemetry drops non-allowlisted fields, deduplicates retry ids, and fails closed as a no-op

Human verification still required before declaring production acceptance:

- [ ] switch rapidly between two real accounts while sync is delayed; verify names, tasks, Energy, Sessions, and V2 world never cross accounts
- [ ] complete and undo a qualifying Focus Session, then inspect Small／Medium／Major reveal readability with normal and reduced motion
- [ ] repeat Home settlement redraws and Home ↔ Full World loops on desktop and mobile; verify no blank canvas, duplicate canvas, or blocked task controls
- [ ] verify keyboard focus order and screen-reader announcements for world, Project, Companion, Main Quest, and reveal status
- [ ] record low-end Android and iOS load time, route teardown, FPS, memory, and fallback behavior against the budgets in section 10
- [ ] review final 3:2 protagonist／Companion／weather art and compressed install-shell weight; current `fallback-proof` files are not final art

## 13. Test plan

Current baseline observed during PS-233:

- `npm run test`: 26 files, 667 tests passed
- `npm run test:e2e`: 22 Chromium tests passed

Those remain the regression floor.

### 13.1 Unit tests

- V1-to-V2 migration preserves all reusable fields.
- Migration is idempotent and owner-scoped.
- Feature flag selects legacy or V2 without mutation.
- Reward ids are deterministic.
- Settling the same Session twice creates one reward set.
- Repeated remote duplicates create one reward set.
- Changed rules require a new ruleset id rather than mutating history.
- Invalid/pre-epoch Sessions earn no V2 reward.
- Hidden-stat priority and amounts match the table.
- Daily Main Quest selects one canonical source.
- Removing the canonical source reassigns or reverses correctly.
- Gold reward and reversal are exact.
- Workspace Project phases are exactly 0/25/50/75/100.
- Project completion and reversal update world unlock and relationship once.
- Momentum boundaries are 2/3/4/5/6/7 effective days.
- Companion priority returns stable dialogue/animation keys.
- Home/full/edit view models are immutable and agree.
- Reveal queue is not replayed after consumption.
- Runtime manager never reports more than one mounted Application.
- reduced-motion selector disables non-essential continuous animation.

Direct tests must exercise the real `commitSession()` and undo integration rather than reimplementing their arithmetic in a test helper.

### 13.2 Integration tests

- Session commit -> ledger -> Project -> persisted world.
- Session undo -> ledger reversal -> Project rollback.
- close/reopen after Session write but before V2 write -> one recovered settlement.
- close/reopen after reveal queued -> one pending reveal.
- repeated `loadFromRemote()` -> no duplicate rewards.
- offline undo -> tombstone -> remote row ignored -> delete retried.
- cross-user sign-out/sign-in -> no V2 state leakage.
- legacy user opens V2 with owned items and placements intact.
- V2 disabled -> legacy behavior unchanged.
- Home and full-page models read the same revision after edits and undo.
- Energy clamp boundary behavior is either corrected by the approved local sidecar or retained as an explicit failing release gate for a separately approved schema decision.

### 13.3 E2E

Automate this full flow with a controlled clock/session duration:

```text
sign in or seeded authenticated state
-> Home Orbit Window visible with Workspace Upgrade
-> start Main Quest from Home
-> complete qualifying Focus Session
-> existing XP settles
-> Home reward reveal completes
-> Project advances 25%
-> open full Personal Space
-> same Project/Companion/world state
-> reload
-> no duplicate and same progress
-> return Home
-> undo source Session
-> Home and full World both roll back
```

Also cover:

- static fallback when Pixi import/init fails
- reduced-motion reveal
- off-viewport suspend/resume
- repeated Home/full route navigation
- legacy flag Home and Personal Space smoke flow
- task completion remains available while V2 assets fail

### 13.4 Manual and performance checks

- iOS Safari and Android Chrome
- installed standalone PWA and normal browser tab
- small phone, large phone, tablet, narrow desktop, wide desktop
- portrait/landscape transition and safe areas
- offline reload with cached approved assets
- WebGL context loss/fallback
- memory pressure and route-loop leak observation
- keyboard, screen reader labels, focus order, contrast, and text zoom

## 14. Acceptance criteria

### State and rewards

- Every V2 reward is traceable to a source Session and ruleset.
- One Session cannot settle the same semantic reward twice.
- Reload and repeated remote reconciliation do not duplicate rewards.
- Undo reverses all dependent active V2 rewards without deleting audit entries.
- Project, Main Quest, Gold, hidden stats, relationship, and world phase are derivable from active ledger entries.
- Legacy data remains readable and V2 migration is idempotent.
- V2 state is not shared across users on the same device.

### Home Orbit Window

- Home shows the live Window in the core content area.
- It shows protagonist, Companion, Active Project, progress, Main Quest, recent change, and pending event.
- Ordinary task feedback appears in the Window.
- Qualifying Focus feedback updates the Project in the Window immediately.
- The user does not need to enter full Personal Space to see the primary reward.
- Home tasks remain usable before runtime load and after runtime failure.
- Off-viewport and hidden-page rendering reduces work.
- Reduced motion uses a complete low-motion alternative.

### Full World and Edit

- Full World shows the same canonical state as Home.
- Returning between routes does not fork state.
- Minimal Edit Mode is visually and behaviorally distinct from World Mode.
- Edit Mode changes only supported placement/theme fields.
- Existing owned/placed items remain available.

### Runtime and quality

- At most one Pixi Application exists.
- All listeners, observers, animation frames, and contexts clean up on route change.
- The static fallback communicates the same Project phase.
- Performance budgets are measured and met or the fallback mode is selected.
- Existing lint, 667-test regression floor, and 22-E2E regression floor remain green, plus all new tests.

## 15. Risk register

| Risk | Evidence/impact | Required mitigation | Gate |
|---|---|---|---|
| Duplicate local settlement | current commit has no id guard | deterministic ledger ids and direct duplicate tests | PS-235 |
| Offline undo resurrects remote Session | current merge has no tombstone | durable tombstone, merge filter, confirmed delete retry | PS-235 |
| Partial Session/profile/Energy sync | independent async writes | reconcile rewards from canonical Sessions; document core mismatch | PS-235/240 |
| Energy undo over/under-reverses at clamps | nominal rather than applied delta | local applied-delta sidecar or approved schema proposal | approval gate |
| Cross-account Personal Space leakage | current bridge key is unscoped and not cleared | owner-scoped V2 keys and isolation tests | PS-234 |
| Retroactive reward flood | all old Sessions could qualify | fixed UTC reward epoch and no pre-epoch rewards | PS-234/235 |
| Gold changes when undo lowers Level | current Gold is Level-derived | one-time opening balance, then ledger-based V2 Gold | PS-234/235 |
| Session snapshot lacks task category/difficulty/planned state | remote reconstruction may lose context | first ruleset uses persisted Session fields only; future fields need schema approval | PS-235 |
| Daily Plan and Session dates diverge before `newDayHour` | plan uses calendar date | align effective-date adapter before plan-based rewards | PS-236 |
| Home rerender leaks/recreates runtime | current Home replaces DOM on settlement | explicit component/runtime cleanup and persistent reveal state | PS-237/239 |
| Home and full page fork state | separate renderers tempt copies | one store, pure presentation view models, revision assertions | PS-236 |
| Pixi delays or breaks task use | large runtime/assets on Home | poster-first dynamic import and independent DOM controls | PS-237/239 |
| Context or asset failure leaves blank area | WebGL/mobile constraints | phase-correct static fallback and recovery path | PS-239 |
| Companion becomes opaque or coercive | future LLM temptation | rule engine owns state; keyed approved dialogue only | PS-236 |
| Shop appears functional but is request-only | no purchase settlement handler | exclude new purchase economy or implement separate ledgered contract | later approval |
| Multi-device V2 world cannot fully sync locally scoped placement | no cloud V2 persistence | disclose limitation; submit schema proposal separately | approval gate |

## 16. Exact expected file plan

Only files listed for a task should change in that task. Existing names may be adjusted once during PS-234 if repository inspection finds a smaller equivalent boundary, but responsibility must remain one-to-one.

### 16.1 New domain and adapter files

| File | Responsibility | Task |
|---|---|---|
| `pwa/js/personalSpace/v2/config.js` | ruleset id, fixed reward epoch, Project/reward constants | PS-234/235 |
| `pwa/js/personalSpace/v2/featureFlag.js` | `legacy | v2` selection and safe fallback | PS-234 |
| `pwa/js/personalSpace/v2/stateSchema.js` | defaults and normalization for the V2 envelope | PS-234 |
| `pwa/js/personalSpace/v2/migrateState.js` | idempotent V1-to-V2 owner-scoped migration | PS-234 |
| `pwa/js/personalSpace/v2/store.js` | one local-first read/write/revision boundary | PS-234 |
| `pwa/js/personalSpace/v2/gameEvents.js` | typed local game-event contract | PS-235 |
| `pwa/js/personalSpace/v2/sessionAdapter.js` | canonical Session fingerprint, sort, eligibility fields | PS-235 |
| `pwa/js/personalSpace/v2/rewardRules.js` | pure expected-reward generation | PS-235 |
| `pwa/js/personalSpace/v2/rewardLedger.js` | immutable entry normalization and semantic ids | PS-235 |
| `pwa/js/personalSpace/v2/reconciler.js` | add/reverse/reduce and crash recovery | PS-235 |
| `pwa/js/personalSpace/v2/projectEngine.js` | Workspace Upgrade phases and completion | PS-235 |
| `pwa/js/personalSpace/v2/questEngine.js` | daily canonical Main Quest selection | PS-235/236 |
| `pwa/js/personalSpace/v2/momentum.js` | seven-effective-day derivation | PS-236 |
| `pwa/js/personalSpace/v2/companionEngine.js` | deterministic Companion priority/output | PS-236 |
| `pwa/js/personalSpace/v2/worldReducer.js` | derived world phase, recent change, relationship | PS-236 |
| `pwa/js/personalSpace/v2/viewModels.js` | pure Home/full/edit presentation models | PS-236 |
| `pwa/js/personalSpace/v2/telemetry.js` | privacy-safe event contract and no-op/local adapter | PS-237/240 |

### 16.2 New runtime and UI files

| File | Responsibility | Task |
|---|---|---|
| `pwa/js/personalSpace/v2/runtime/pixiSceneRuntime.js` | Pixi scene mount/render/resize/failure seam | PS-237 |
| `pwa/js/personalSpace/v2/runtime/runtimeManager.js` | single Application, suspend/resume/destroy/cache | PS-239 |
| `pwa/js/personalSpace/v2/ui/orbitWindow.js` | Home poster/DOM/runtime surface and actions | PS-237 |
| `pwa/js/personalSpace/v2/ui/rewardReveal.js` | Small/Medium/Major reveal state machine | PS-237 |
| `pwa/js/personalSpace/v2/ui/worldHud.js` | shared compact HUD | PS-238 |
| `pwa/js/personalSpace/v2/ui/projectPanel.js` | Project phases and next requirement | PS-237/238 |
| `pwa/js/personalSpace/v2/ui/companionPanel.js` | keyed Companion state/dialogue interaction | PS-237/238 |
| `pwa/js/personalSpace/v2/ui/editorOverlay.js` | minimal Edit Mode boundary | PS-238 |
| `pwa/js/pages/personalSpaceV2.js` | V2 scene-first page composition | PS-238 |

### 16.3 Existing files expected to change

| File | Narrow change | Task |
|---|---|---|
| `pwa/js/sessionFlow.js` | invoke V2 reconcile after commit/undo; preserve legacy behavior | PS-235 |
| `pwa/js/storage.js` | local deletion tombstone/retry seam and post-remote reconcile hook | PS-235 |
| `pwa/js/utils.js` | tombstone-aware Session merge helper if kept generic | PS-235 |
| `pwa/js/pages/home.js` | place/mount/unmount the mandatory Orbit Window | PS-237 |
| `pwa/js/pages/personalSpace.js` | feature-flag dispatch only; legacy renderer retained | PS-238 |
| `pwa/js/router.js` | explicit route cleanup seam | PS-239 |
| `pwa/js/personalSpace/gameState.js` | V1 read compatibility and migration adapter only | PS-234 |
| `pwa/js/personalSpace/index.js` | shared selector/adaptation seam where necessary | PS-236 |
| `pwa/assets/style.css` | Home Window, full World, Edit, fallback, responsive, reduced-motion styles | PS-237/238 |
| `pwa/sw.js` | approved V2 code/asset caching; version changed only through bump workflow | PS-239/240 |
| `package.json` / `package-lock.json` | PixiJS 8 only after approved spike | PS-237 |
| `CHANGELOG.md` | user-facing slice entry generated/filled with bump | PS-240 |
| `tasks.md` | lifecycle status for PS-234 through PS-240 | each task |
| `ROADMAP.md` | additive status update only when slice status changes | PS-240 |

### 16.4 Production asset paths

```text
pwa/assets/personal-space/v2/workspace/backgrounds/
pwa/assets/personal-space/v2/workspace/lighting/
pwa/assets/personal-space/v2/workspace/project-phases/
pwa/assets/personal-space/v2/workspace/props/
pwa/assets/personal-space/v2/characters/protagonist/
pwa/assets/personal-space/v2/characters/companion/
pwa/assets/personal-space/v2/effects/
pwa/assets/personal-space/v2/fallback/
pwa/assets/personal-space/v2/manifest.json
```

Only QA-approved runtime assets enter these paths. Raw generation outputs remain outside production asset directories.

### 16.5 New tests

```text
tests/unit/personalSpaceV2Migration.test.js
tests/unit/personalSpaceRewardLedger.test.js
tests/unit/personalSpaceProjectEngine.test.js
tests/unit/personalSpaceQuestEngine.test.js
tests/unit/personalSpaceMomentum.test.js
tests/unit/personalSpaceCompanion.test.js
tests/unit/personalSpaceViewModels.test.js
tests/unit/personalSpaceOrbitWindow.test.js
tests/unit/personalSpaceRuntimeLifecycle.test.js
tests/integration/personalSpaceRewards.test.js
tests/integration/personalSpaceReconciliation.test.js
tests/e2e/personal-space-v2-flow.spec.js
```

### 16.6 Approval-gated files, not part of the local-first slice

Do not create or modify these without a separate approved proposal:

- any `pwa/db/*.sql` migration for a reward ledger, world state, tombstones, or applied Energy delta
- `pwa/js/auth.js` or `pwa/js/authFlow.js`
- tokens, secrets, `.env`, Supabase configuration, or RLS policies
- deployment, CI/CD, or GitHub Pages configuration

A future approved cloud design may add a migration such as `pwa/db/011_personal_space_v2.sql`, but that filename is a placeholder for the proposal, not authorization to implement it.

## 17. Mandatory non-goals addition

The first phase must not:

- postpone the Home Orbit Window to a later version
- place only a stateless Personal Space image on Home
- provide only a “Go to Personal Space” button
- require opening the Personal Space page to see task-completion feedback
- create separate Home and full-Personal-Space states
- initialize the full furniture editor on Home
- allow PixiJS failure to block task functionality

It also does not include:

- Unity, a true 3D runtime, or a second application stack
- free camera rotation or mandatory multi-camera furniture variants
- eight-direction character movement
- combat, physics, gacha, loot boxes, or random-value rewards
- multiplayer or large NPC populations
- an LLM controlling economy, rewards, relationship, or state
- all Survival/Building/Mastery scenes
- hundreds of generated furniture assets
- a new production shop without reversible purchase settlement
- deletion of legacy Personal Space
- silent auth, database, RLS, deployment, or CI changes
- cloud-synced V2 state without explicit schema approval

## 18. Mandatory final outcome addition

The final delivery must simultaneously contain:

```text
Home Orbit Window
+ Full Personal Space World Mode
+ Minimal Edit Mode
+ Reward Ledger
+ Active Project
+ Companion Reaction
```

Home is the primary entrance to the game loop, not advertising inventory for Personal Space.

The complete success path is:

```text
Home shows world state
-> user performs a real-world task
-> Session settles safely
-> Reward Ledger records deterministic rewards
-> Active Project progresses
-> Home Orbit Window immediately presents the world change
-> protagonist and Companion react
-> next goal is visible
-> user may enter full Personal Space and see the same world
-> reload and repeated sync remain consistent
-> undo reverses Home and full-world state together
```

The slice succeeds only if it makes a valuable real-world action feel visibly consequential without turning the virtual room into a substitute for that action.
