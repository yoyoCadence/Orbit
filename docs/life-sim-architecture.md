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
