# Orbit Life Sim Architecture

## Purpose

This document explains how Orbit can evolve from a behavior tracker into a self-growth life sim without destabilizing the current PWA.

Phase 1 is intentionally architecture-first:

- define domain boundaries
- reserve platform adapters
- create personal space entry points
- keep current progression systems intact

## Architectural Intent

Orbit should move toward:

```text
task engine and progression
  -> personal space state
  -> scene/runtime layer
  -> companion behavior layer
  -> dialogue layer
  -> social and monetization surfaces
```

The current application still uses:

- hash-based routing
- Vanilla JS page renderers
- localStorage-first persistence
- Supabase background sync

The life-sim layer must adapt to this reality instead of replacing it.

## Module Responsibilities

### `pwa/js/personalSpace/`

Holds life-sim-specific domain logic.

- `economy.js`
  Gold formulas, price bands, and initial purchase rules.

- `unlockRules.js`
  Level-based unlock progression for scenes, furniture tiers, and future features.

- `gameState.js`
  Local personal-space state container. Keeps space-specific state separate from core app state.

- `sceneRuntime.js`
  Runtime seam for future 2D/3D scene mounting, animation loops, and cleanup.

- `assetRegistry.js`
  Lookup table for scenes, props, future models, and visual packs.

- `interactionBus.js`
  Event bus between scene entities, UI overlays, and future companion behavior.

- `avatar/`
  Placeholder controllers for avatar movement and animation.

- `npc/`
  Placeholder controllers for AI companion planning and behavior.

- `world/`
  Scene descriptors and furniture anchor definitions.

- `ui/`
  Overlay surfaces such as shop, dialogue bubble, and HUD.

### `pwa/js/platform/`

Holds platform capability seams so PWA and future native wrappers can share one interface.

- notifications
- haptics
- share
- purchases
- storage bridge

Current implementations should be safe browser fallbacks or no-ops.

## Data Strategy

Phase 1 should not introduce schema changes.

Guiding rules:

- core progression remains sourced from current user/task/session data
- personal-space state should stay local and isolated
- future backend sync can be added later after the model stabilizes

This lets the team validate product shape before expanding persistence complexity.

## Personal Space Navigation Model

The personal-space layer should support two navigation modes at the same time:

1. direct scene switching
2. in-scene exit interaction

These solve different user needs.

### Direct Scene Switching

Direct switching is the anti-confusion path.

It should stay available even after richer scene interactions exist so users can:

- jump quickly to a target scene
- compare spaces without extra taps
- recover if they feel lost
- test stage progression efficiently

Recommended UI shape:

- first layer: `住處 / 上班 / 回顧`
- second layer: scenes within the selected category

Meaning of each category:

- `住處`
  Active residence scenes for the current stage
- `上班`
  Active workplace scenes and unlocked office floors
- `回顧`
  Memory-property scenes such as older office floors or buy-back rental space

### In-Scene Exit Interaction

Direct switching should not be the only way to move.

Scene layouts should also expose exit nodes so navigation feels spatial:

- rental room -> door -> company first floor
- office floors -> elevator -> another office floor
- estate room -> door -> adjacent estate room
- estate floor -> elevator -> another estate floor

For near-term implementation, prefer lightweight transition feedback:

- tap exit
- highlight exit
- show destination label
- transition scene

Do not block this work on full avatar pathfinding.

### Interactive Scene Graph

Exit nodes should be treated as one kind of interaction node, not as a separate one-off system.

The personal-space scene graph should support:

- `exit` nodes
  Doors, elevators, stairs, and portals that move the user to another scene.
- `view` nodes
  Windows, balconies, overlooks, and close-up viewpoints that move the avatar to an anchor and switch the camera or visual view.
- `inspect` nodes
  Furniture, desks, walls, and props that open a lightweight detail panel or contextual UI.
- `npc` nodes
  Companion or character interaction points.

This keeps the mental model stable:

```text
scene -> interaction node -> action sequence -> scene / view / panel
```

Example future interaction:

```text
office-corner
  node: office-window
    type: view
    label: 看窗外
    anchorId: window-side
    actions:
      - walkTo(window-side)
      - switchView(office-window-view)

office-window-view
  backgroundAssetId: office-window-skyline-default
  illustrationSlot: window-view-portrait
  exitAction: backToScene(office-corner)
```

The initial implementation can render this in 2D. The same data should later be readable by a Three.js runtime as camera targets, camera transitions, and asset references.

## Scene Graph and Building Graph

To keep future layout changes cheap, the system should separate:

### Scene Registry

Describes an individual scene:

- id
- label
- category (`home` / `work` / `memory`)
- family (`rental` / `office` / `estate`)
- stage visibility
- visual pack

### Interaction Node Registry

Describes interactive nodes inside a scene:

- node id
- source scene id
- node type (`exit` / `view` / `inspect` / `npc`)
- label
- anchor id
- action sequence
- optional destination scene id
- optional destination view id
- optional placement metadata

### Anchor Registry

Describes named locations where avatar movement or camera focus can target:

- anchor id
- scene id
- position metadata for current 2D runtime
- future 3D position / rotation metadata

### Action Sequences

Describes what happens after an interaction node is selected:

- `walkTo(anchorId)`
- `switchView(viewId)`
- `changeScene(sceneId, entryAnchorId)`
- `openPanel(panelId)`
- `backToScene(sceneId)`

These actions should be data, not hardcoded branching inside `sceneRuntime.js`.

### View Registry

Describes close-up or alternate views within a scene:

- view id
- source scene id
- background asset id
- foreground illustration slot
- optional camera preset
- exit action

This allows features such as looking out an office window, stepping onto an estate balcony, or focusing on a desk without redefining the whole scene.

### Asset Slots

Describes replaceable visual references:

- default background asset
- user-selected illustration asset
- seasonal skyline
- future 3D model reference

The runtime should resolve these through `assetRegistry.js` so scene data does not depend on a specific rendering implementation.

### Arrival Rules

Describes where the player should appear after entering from a specific exit.

This keeps future avatar/controller work decoupled from page rendering.

### Building / Floor Map Registry

Describes the whole structure of:

- company building
- estate

It should define:

- floors
- rooms
- adjacency
- which scenes belong to which floor

This is the source of truth for future map modal UI.

## Memory Property Rules

Orbit should preserve emotional continuity in its spaces.

Two memory-property directions are important:

### Older Office Floors

When the primary workplace upgrades to a higher floor, previous work scenes should not disappear.

They should be reclassified as revisitable memory properties:

- still accessible from the `回顧` category
- visually read as an older workplace
- may show other employees continuing to work there

This preserves the feeling that the company lives on without the player being frozen in old progression.

### Original Rental Space

After the user moves into the estate, the original rental should no longer remain an active residence.

Later, the system should allow a buy-back moment where the rental returns as a memory property that preserves its final historical state.

## Recommended Next Implementation Order

The next personal-space work should be split into small tasks:

1. define interactive scene graph data for scenes, nodes, anchors, actions, views, and asset slots
2. introduce lightweight exit-node metadata and destination transitions
3. prototype an office-window view node with a replaceable window-view illustration slot
4. define office / estate building maps and a map modal surface
5. connect ownership / placement state after the navigation graph is stable

## Companion System Split

The companion architecture should stay split:

### Behavior Layer

- rule-based triggers
- spatial reactions
- timing and presence logic
- testable state transitions

### Dialogue Layer

- language output
- summaries
- encouragement
- long-form conversation

This prevents expensive, opaque model calls from controlling every moment-to-moment behavior.

## Native and Hybrid Readiness

Orbit should remain easy to wrap later in a hybrid shell by:

- avoiding direct platform APIs scattered across page files
- using `pwa/js/platform/` as the replacement boundary
- keeping personal-space runtime separate from auth and storage internals

## Suggested Next Build Order

1. Stabilize the personal space page model and economy display.
2. Add owned item state and a minimal local shop flow.
3. Introduce a lightweight visual scene representation.
4. Add rule-based companion presence.
5. Expand toward richer rendering only after the underlying state model is proven.
