# Personal Space V2 Product Specification

## 1. Document Status

This document defines the product contract for the first Personal Space V2 vertical slice. It is additive to the current Orbit PWA and does not authorize a rewrite of the existing application, authentication, cloud schema, or progression formulas.

Repository facts at the v1.20.6 baseline:

- The home page currently renders Today stats, the daily plan, task groups, and today's session log. It does not render Personal Space.
- The existing `Idle Growth Window` is a DOM-based layered-raster prototype inside the separate Personal Space page.
- The legacy idle prototype uses a 16:9 frame, multiple camera profiles, level-gated props, and a full-screen furniture editor.
- Personal Space state is local-first and currently stores version 1 data such as `ownedItems`, `placedItems`, `idleWindowLayouts`, scene selection, hidden stats, and companion relationship stage.
- Session completion and reversal currently settle XP and Energy, but there is no reward ledger, Active Project, Main Quest, or pending world-reveal pipeline yet.

These facts are the starting point, not evidence that the V2 loop is complete.

## 2. Product Vision

Personal Space V2 is Orbit's primary game-feedback surface: a world that makes real growth visible without replacing the real work.

The core loop is:

```text
Choose a real task
→ perform it in the real world
→ commit a Session safely
→ settle understandable rewards
→ update the Personal Space world
→ show player and Companion reactions
→ present one clear next goal
→ return to real action
```

The product succeeds when the user wants to complete meaningful real-world work because they understand and care about the next world change. Time spent decorating is secondary to time spent acting.

## 3. Goals and Product Principles

### 3.1 Goals

- Connect Instant Task and Focus Session completion to immediate, visible world feedback.
- Give the user one Active Project with legible milestone progress.
- Put the shared world state on the home page through Orbit Window.
- Separate frequent world viewing from infrequent editing.
- Preserve existing task, session, XP, Energy, scene, furniture, and PWA behavior while V2 is validated.
- Make every durable reward traceable and reversible through its source Session.

### 3.2 Principles

1. Real behavior has priority over virtual grinding.
2. Every reward has a clear source and meaning.
3. Long-term world progress is not destroyed by one missed day.
4. Recovery is a valid strategy, not a failure state.
5. Companion language cannot shame, threaten, or emotionally coerce the user.
6. Valuable rewards are deterministic; cosmetic variation may be random.
7. The smallest useful world change is preferable to an opaque shower of numbers.
8. One proven room comes before world-scale content production.
9. Legacy data and assets are preserved until migration and fallback behavior are verified.

## 4. Presentation Architecture

Personal Space V2 has three presentations over one authoritative world state.

| Presentation | Primary job | Includes | Excludes |
|---|---|---|---|
| `home-window` | Understand today's world state, start real work, see immediate rewards | Current scene, player, Companion, Active Project, Main Quest, recent change, pending event | Full inventory, store, placement controls, debug data |
| `full-world` | Inhabit and explore the current world | Interactive scene, concise HUD, project state, dialogue, room navigation, story and collection entry points | Always-visible editor controls and development metrics |
| `edit` | Perform low-frequency customization | Furniture inventory, shop, legal placement zones, snapping, theme and decoration tools | Session reward playback and task-first home flow |

Required render-mode contract:

```js
renderMode: 'home-window' | 'full-world' | 'edit'
```

All presentations derive from the same persisted state, reducers, event stream, asset registry, time-band rules, player animation state, and Companion state. Presentation view models are read-only and cannot settle rewards or mutate formal game state.

```text
Game Event
  → Reward / World Reducer
  → Persisted Personal Space V2 State
      ├── Home Orbit Window View Model
      ├── Full World View Model
      └── Edit Mode View Model
```

### 4.1 Navigation-Level Wireframes

Home page:

```text
┌──────────────────────────────┐
│ Header / Today Stats         │
├──────────────────────────────┤
│ Orbit Window (3:2)           │
│ World + Project + Main Quest │
├──────────────────────────────┤
│ Main Quest / Daily Plan      │
├──────────────────────────────┤
│ Task Groups                  │
├──────────────────────────────┤
│ Today's Sessions             │
└──────────────────────────────┘
```

Full Personal Space:

```text
┌──────────────────────────────┐
│ Lv.  Gold  Momentum  Map  ☰  │
│                              │
│      Interactive World       │
│                              │
│ Active Project         75%   │
├──────────────────────────────┤
│ Project Decorate Story More  │
└──────────────────────────────┘
```

Edit Mode:

```text
┌──────────────────────────────┐
│ Done   Room / Theme   Undo   │
│                              │
│ Scene + legal placement UI   │
│                              │
├──────────────────────────────┤
│ Inventory / Shop / Selected  │
└──────────────────────────────┘
```

## 5. Home Must Integrate a Live Personal Space Window

The home Personal Space window is not an optional thumbnail, advertisement, future enhancement, or shortcut card. `Orbit Window` is a required part of the Personal Space V2 vertical slice and the primary place where ordinary Session rewards are seen.

The user must not be required to open the Personal Space route after task completion to receive the main game feedback.

### 5.1 Position on Home

Preferred hierarchy:

```text
Header / Today Stats
→ Orbit Window
→ Main Quest / Daily Plan
→ Task Lists
→ Today's Sessions
```

The final implementation may tune spacing around the current home renderer, but Orbit Window must:

- be easy to see on first home entry;
- require no expansion before its world state can be understood;
- preserve a fast path to starting a task;
- avoid pushing task lists excessively deep;
- remain reachable with one-handed mobile interaction;
- make the scene and today's main objective understandable together.

A compact or user-collapsible height may be evaluated. It must not default to permanently collapsed, and the collapsed state must never hide a pending reward or required event without a visible indicator.

### 5.2 Required Content

Orbit Window must show:

- current room or scene;
- the player's current action;
- Companion state;
- Active Project name;
- Active Project progress and next meaningful threshold;
- today's Main Quest;
- the most recent world change;
- a visible pending or claimable event indicator.

It may also show:

- Momentum;
- time-band lighting;
- weather;
- one primary scene interaction;
- a new-item package;
- one short Companion line.

It must not directly show:

- the full furniture editor;
- all owned items or all scenes;
- the complete shop or unlock history;
- placement debug information;
- asset readiness or developer status;
- legacy camera controls.

### 5.3 Relationship to Full Personal Space

The home and full views must share:

- one world state;
- one Active Project state;
- one Main Quest state;
- one player animation state;
- one Companion state;
- one asset registry;
- one reward-event stream;
- one lighting and time-band policy.

No Project progress, Companion state, or reward state may be copied into a home-only store. Navigating home → full world → home must render the same progress and pending-event status.

### 5.4 Immediate Home Reward Feedback

Instant Task and Focus Session completion must follow this sequence:

```text
Session commit
→ Reward Ledger settlement
→ World state update
→ Home Orbit Window reward animation
→ Numeric and visible world-change summary
→ Stable, operable idle state
```

Example for a completed 45-minute deep-work Session:

1. The player stops working and celebrates briefly.
2. A finished document appears on the desk.
3. Workspace Upgrade changes from 50% to 75%.
4. The Companion approaches and reacts once.
5. The window reports `+126 XP`, `Depth +3`, and `Workspace Upgrade +25%`.
6. The world returns to its stable idle state.

The reveal must be driven by a persisted, idempotent reward result or pending event. A full `renderHome()` must not duplicate a reward, lose it, or create a second runtime.

### 5.5 Reward Reveal Responsibilities

| Reward level | Presentation | Typical triggers |
|---|---|---|
| Small | Plays fully inside Orbit Window | Ordinary valid task, small hidden-stat gain, normal Project progress |
| Medium | Orbit Window temporarily expands or gains emphasis | Main Quest, effective day, Project phase, Weekly Contract subgoal |
| Major | Full-screen reveal, then return to updated Orbit Window | Project completion, new room/chapter, relationship stage, important level milestone |

Ordinary completions must not repeatedly interrupt the user with full-screen modals. After any Major Reveal, the home window must show the already-updated persistent world.

### 5.6 Loading and Runtime Strategy

Home must remain fast and useful even when the interactive runtime is not ready.

Initial presentation must show at least one of:

- a static poster;
- a pre-rendered or most recently saved scene snapshot;
- an intentional skeleton with meaningful text status;
- a low-cost DOM fallback.

The area must not be blank while PixiJS loads. Interactive runtime initialization should occur only after one or more of these conditions:

- Orbit Window intersects the viewport;
- the user taps the window;
- a Session is about to settle;
- the browser is idle;
- the minimum texture set is available.

`IntersectionObserver`, `requestIdleCallback` with a fallback, and dynamic imports are acceptable. The runtime must expose `mount`, `suspend`, `resume`, and `destroy`; route changes and repeated home renders must not leave multiple Pixi applications, animation loops, observers, or global input listeners alive. Home and full world may share runtime modules and texture caches, but they need not keep two WebGL contexts alive.

Pixi initialization failure must fall back to the static presentation without blocking task, Focus, plan, or session-log interactions.

### 5.7 Ratio and Responsive Contract

Home is mobile-first:

```text
visible ratio: 3:2
logical design size: 960 × 640
baseline source output: 1920 × 1280
```

The current legacy 16:9 idle frame is not the V2 home contract. V2 uses one fixed canonical room camera and a safe composition zone that keeps the player, Companion, Active Project object, and current world change visible across small phones, large phones, tablets, narrow desktop windows, wide desktop windows, standalone PWA mode, safe areas, and browser-toolbar height changes.

### 5.8 Home Interactions

The first slice supports only high-value interactions:

- tap the scene to enter full Personal Space;
- tap Active Project to inspect its next threshold;
- tap the Companion for the current short line;
- tap a new item or event to view or claim it;
- tap Main Quest to locate or start the relevant real task.

Full furniture dragging is forbidden on home. The home loop remains:

```text
understand state → begin real work → see world change
```

### 5.9 Home View Model

The home view model is independently shaped but derived from shared state:

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

It cannot mutate state. All changes pass through:

```text
Game Event → Reward / World Reducer → Persisted State → View Model
```

### 5.10 Home Acceptance Criteria

- Home visibly contains a live or gracefully degraded Personal Space window in its core content area.
- Orbit Window shows Active Project, player, Companion, Main Quest, recent world change, and pending-event state.
- Completing an ordinary task shows feedback directly on home.
- Completing a Focus Session and returning home plays the correct pending feedback.
- Project progress updates immediately and survives reload.
- Home and full Personal Space always render the same Project and world state.
- Returning from full Personal Space keeps home consistent.
- First interaction is not significantly delayed by PixiJS.
- Leaving the viewport lowers runtime cost.
- `prefers-reduced-motion` uses a reduced animation path.
- PixiJS failure shows a useful static fallback.
- Legacy Personal Space mode does not break home tasks or navigation.

## 6. Full Personal Space World Mode

World Mode is the default full-page experience. The scene should occupy approximately 55–65% of the mobile viewport, subject to safe-area and small-screen testing.

The top HUD is limited to:

- Level;
- available Gold;
- Momentum;
- Map;
- necessary notification state.

The bottom dock provides high-level entry points such as Project, Decorate, Collection, Story, and Map/More. It does not permanently display total earned Gold, spent Gold, owned/placed counts, full unlock lists, prototype explanations, or developer diagnostics. Those belong in secondary panels.

World Mode supports:

- watching player and Companion behavior;
- inspecting the current room and Active Project;
- receiving world changes and concise dialogue;
- switching unlocked rooms;
- using a small set of meaningful interactables;
- seeing one clear next objective.

## 7. Edit Mode

Edit Mode is explicitly entered and exited. Its visual state and input behavior must not be confused with World Mode.

It supports:

- placing owned furniture within legal zones;
- moving small objects and snapping them to support surfaces;
- selecting compatible visual states or themes;
- browsing inventory and the minimal shop;
- managing decoration and collections.

It reuses `ownedItems`, `placedItems`, placement planes, support surfaces, footprints, and character anchors where compatible. V2 does not require legacy left/center/right furniture variants. Large furniture uses a canonical perspective and constrained slots; small props receive more freedom.

## 8. Reward and World Feedback

### 8.1 Reward Levels

- **Small, 1.5–3 seconds:** player motion, one Companion reaction, XP/hidden-stat/Project delta, minor environment change.
- **Medium, 3–6 seconds:** stronger scene animation, Project phase change, Main Quest/effective-day feedback, new interaction, Gold or blueprint when defined.
- **Major:** full-screen reveal for a durable milestone, followed by an updated stable world and next objective.

Every reward must be attributable to a source Session, idempotent across reload and sync, and reversible when that Session is revoked. UI animation is a projection of settled data, never the source of truth.

### 8.2 Active Project

The vertical slice has one Active Project:

```text
Workspace Upgrade
```

It has five legible phases:

| Progress | Visible state |
|---:|---|
| 0% | Empty work corner |
| 25% | Basic desk |
| 50% | Lighting and storage |
| 75% | Single monitor and work board |
| 100% | Dual-monitor formal workstation |

Project progress must explain its source and next requirement. It is not a free-floating progress bar.

### 8.3 Daily Quest and Companion

The slice presents one Main Quest, up to two optional Side Quests, and one Recovery Objective. The Main Quest links to a real task and carries the primary daily Project or Gold bonus; there is no login-only reward.

The first Companion is rule-based. Its state may include `observe`, `approach`, `remind`, `congratulate`, `rest`, and `work`. It can react to recent Sessions, daily stats, hidden stats, Momentum, missed patterns, the Active Project, and relationship stage, but it cannot decide economic rewards or alter durable state outside reducers.

## 9. Legacy Compatibility and Migration Boundary

- Keep the current Personal Space page and its assets available behind `personalSpaceRuntime: 'legacy' | 'v2'` until V2 fallback is verified.
- Preserve legacy 16:9 backgrounds, camera-profile schema, furniture variants, editor layouts, ownership, placements, scene unlocks, and memory-scene data.
- Do not reinterpret the legacy multi-camera Idle Window as the V2 home surface.
- Compatible assets may be reused after V2 composition and quality review; incompatible placements use an explicit fallback rather than silent corruption.
- Any state version upgrade requires an idempotent migration with tests. Loading state cannot repeatedly write data or settle rewards.

## 10. Accessibility and Motion

- All non-decorative Canvas interactions need semantic DOM controls or an equivalent accessible interaction list.
- Project, quest, and reward changes must not depend on color alone.
- Text overlays require readable contrast over every lighting and weather state.
- Touch targets should be at least 44 × 44 CSS pixels where layout permits.
- Keyboard focus order follows the visible hierarchy and has an obvious focus indicator.
- Reward summaries use a polite live region; repeated idle motion is not announced.
- `prefers-reduced-motion` replaces camera movement, particles, character travel, and scale bursts with short fades, state swaps, or a static before/after summary.
- Reduced motion cannot suppress the reward meaning, next objective, or state change.
- A Canvas/WebGL failure retains text status and all core task controls.

## 11. First Vertical Slice

The first slice covers only Building Stage: Formal Workstation. It includes one canonical room, one player, one Companion, Workspace Upgrade, one Main Quest flow, minimum World and Edit modes, reward settlement/reversal, and the home Orbit Window.

Required end-to-end flow:

```text
User enters home
→ sees Orbit Window and Workspace Upgrade
→ starts Main Quest from home
→ completes a 25-minute Focus Session
→ Session settles safely
→ returns to home
→ Orbit Window plays player and Companion feedback
→ Workspace Upgrade progress increases
→ user taps Orbit Window
→ full Personal Space opens
→ full world shows the same progress and world state
```

If the full Personal Space page exists but the home Orbit Window does not, the vertical slice is not complete.

## 12. Non-Goals and Forced Limits

The first slice does not include Unity, a true 3D runtime, free camera rotation, eight-direction movement, complex physics, combat, loot boxes, random valuable rewards, large NPC populations, multiplayer, all three life stages, hundreds of generated props, or deletion of legacy Personal Space.

It also must not:

- postpone Orbit Window to a later release;
- put only a stateless Personal Space image on home;
- provide only a “Go to Personal Space” button;
- require entry into Personal Space to see task-completion feedback;
- create separate home and full-world state;
- initialize the full furniture editor on home;
- let PixiJS failure block any task function;
- expose legacy camera switching as a required V2 feature;
- change existing XP, Energy, auth, or cloud-schema rules as an incidental implementation detail.

## 13. Validation and Success Metrics

The slice should instrument privacy-conscious events such as:

```text
orbit_window_viewed
orbit_window_opened
personal_space_loaded
reward_reveal_started
reward_reveal_completed
project_progressed
project_completed
companion_interacted
edit_mode_opened
quest_completed
```

Validation covers:

- Orbit Window click-through and reward completion;
- Personal Space return rate;
- whether users understand the Active Project and next action;
- home first-interaction time;
- Pixi initialization time, FPS, and memory on representative mobile devices;
- reload, offline, sync, and Session-reversal consistency;
- D1/D7 return and meaningful task-completion change;
- whether decoration displaces real task execution.

No unnecessary sensitive data is collected.

## 14. Final Outcome

The required delivery is:

```text
Home Orbit Window
+ Full Personal Space World Mode
+ Minimum Edit Mode
+ Reward Ledger
+ Active Project
+ Companion Reaction
```

Home is the main entry to the game loop, not an advertisement for Personal Space.

The complete success path is:

```text
Home shows shared world state
→ user performs a real task
→ Session settles safely
→ Reward Ledger records attributable rewards
→ Active Project advances
→ Home Orbit Window immediately presents the world change
→ player and Companion react
→ one next goal is shown
→ full Personal Space displays the same world
→ reload and sync preserve consistency
→ Session reversal rolls back both home and full-world state
```

