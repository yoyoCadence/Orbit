---
name: orbit-idle-window-assets
description: Build and integrate Orbit Personal Space idle-window visual assets. Use when Codex needs to create, review, split, register, or wire HD-2D-inspired idle-game window backgrounds, furniture direction variants, support surfaces, placement metadata, character anchors, or editor feasibility rules for Orbit's additive Idle Growth Window.
---

# Orbit Idle Window Assets

## Overview

Use this skill for Orbit's independent `Idle Growth Window`: a mobile-idle-game-like Personal Space view that coexists with the existing 2D scene layer and future 3D path. The core rule is simple: prove art, placement, and runtime contracts before expanding asset volume.

For detailed production rules, read `references/production-contract.md` when the task involves new assets, new furniture metadata, or layout changes.

## Workflow

1. Confirm the target is the additive idle window, not a replacement for the existing `Current Scene Layer`.
2. Inspect the current Orbit files before editing:
   - `pwa/js/personalSpace/idleWindow/assetRegistry.js`
   - `pwa/js/personalSpace/idleWindow/layouts.js`
   - `pwa/js/personalSpace/idleWindow/index.js`
   - `pwa/js/personalSpace/idleWindow/renderer.js`
   - `pwa/js/personalSpace/idleWindow/editorRuntime.js`
   - `pwa/assets/personal-space/idle-window/`
3. If generating raster art, use the built-in `image_gen` flow and save final project assets into `pwa/assets/personal-space/idle-window/`.
4. For camera backgrounds or furniture variants, use the controlled reference workflow below before expanding the set.
5. For transparent furniture or props, generate on flat magenta `#ff00ff`, then remove the key locally. Do not leave runtime assets under the generated-images folder.
6. Register assets in `assetRegistry.js` with stable ids, dimensions, source, qc, and variant metadata.
7. Wire placement in `layouts.js` with percent coordinates, footprints, support surfaces, camera profile preferences, and character anchors.
8. Keep state additive: idle placements belong under `personalSpaceState.idleWindowLayouts`, not `placedItems`.
9. Update tests and documentation before finishing.

## Asset Generation Rules

- Background camera profiles must be real authored views: `left`, `center`, `right`.
- The long-term target is reference-to-angle-pack generation: one approved image should be usable to generate multiple meaningful camera/object angles, not only tiny left/right rotations.
- Background angle packs may include `center`, `left`, `right`, `overhead`, `top-down`, `isometric`, or `plan-view` proofs. Only wire `left/center/right` into the current runtime until a layout explicitly supports the extra angle.
- Large furniture must use authored variants such as `front`, `left-wall-flush`, and `right-wall-flush`; do not call mirrored or CSS-rotated art final.
- Extended furniture packs may include `back`, `left-side`, `right-side`, `three-quarter-left`, `three-quarter-right`, and `top-down` when future placement or rotation systems need them.
- Small props should be allowed to move freely in edit mode, then snap to valid support surfaces.
- Character interaction should use furniture-defined anchors instead of changing the sprite contract.
- If a generated asset is only a feasibility proof, label it clearly in registry/docs with `production-proof`, `prototype-mirror`, or `needs-generated-perspective-art`.

## Continuity Levels

Choose the continuity level before generating angles. Do not treat every angle proof as production-ready.

- `L0 style-family`: same genre, palette, and mood. Useful for ideation only; room layout and people may drift.
- `L1 room-identity`: same material families, windows, lighting, and major zones. Good for early background proofs.
- `L2 landmark-locked`: named architectural zones, counters, large furniture, and people clusters must keep their identity and relative positions. Use this for validating same-scene angle packs.
- `L3 runtime-accurate`: generate clean empty background angle packs first, then place furniture, NPCs, bags, cups, and service interactions as separate runtime props/sprites. Use this when exact continuity matters.

Production idle-window scenes should aim for `L3`. A baked crowd scene can be an art proof, but it is not a stable runtime background if individual people, furniture, or purchasable props must remain consistent across angles.

## Controlled Reference Workflow

Use this workflow whenever consistency matters across room angles, stage variants, or future furniture additions.

1. Author or select one approved reference image first:
   - Rooms: use the `center` camera background as the canonical material/style reference.
   - Furniture: use the best `front` prop as the canonical silhouette/material reference.
2. Visually inspect the reference before generation. Confirm floor material, wall panels, wallpaper, window shape, light temperature, palette, and pixel density.
3. Generate follow-up images from that reference, not from independent text-only prompts:
   - Room `left` and `right` views must preserve the same flooring, wall finish, trim, window design, lighting direction, and object scale.
   - Room `overhead` / `top-down` views must still read as the same place. Preserve floor material, wall color, trim, window placement, light temperature, and major architectural identity even when the camera changes dramatically.
   - Furniture `left-wall-flush` and `right-wall-flush` variants must preserve the exact wood/metal/fabric identity and only change perspective.
   - Extended furniture angles such as `back` or `top-down` should be generated only after the front/side runtime set proves stable.
4. Reject any angle variant that changes material families, wallpaper, room layout identity, floor texture, skyline style, lighting temperature, or object silhouette.
5. Store provenance in the asset README or raw folder notes: reference path, generated output path, accepted/rejected status, and any consistency issues.
6. Register non-runtime angle experiments with `role: 'angle-proof'` or document them without wiring them into `layouts.js`.

## Landmark-Locked Scene Workflow

Use this after an `L1` proof shows the right broad direction but details drift.

1. Write a reference inventory before generating:
   - architectural anchors: windows, doors, wall panels, columns, stairs, bars, counters
   - large movable anchors: sofas, tables, shelves, display cases, rugs
   - activity clusters: named groups such as `G1 reception payment`, `G2 bar order`, `G3 family with shopping bags`
   - relative positions: left / center / right / foreground / background and adjacency relationships
2. Generate angle variants with that inventory in the prompt. Ask the model to preserve named anchors and clusters, not just the mood.
3. If an anchor would be hidden by the new camera angle, it may be naturally occluded, but it should not be replaced by a different object.
4. Reject outputs that add, remove, swap, or relocate named anchors in a way that changes the floor plan.
5. For busy human scenes, prefer splitting people into separate transparent sprites after the room background is stable.

Failure signs from the hotel proof:

- acceptable: same hotel mood, same navy/gold palette, same bar/reception/boutique/window language
- not acceptable for production: reception, bar, boutique shelves, sofas, and people clusters are re-authored instead of camera-shifted
- not acceptable for precise continuity: family, solo guest, concierge, and luggage positions change between views
- implication: use `L2 landmark-locked` prompts for proofing and `L3 runtime-accurate` layering for final Orbit scenes

Prompt shape for a landmark-locked room angle:

```text
Use the provided room image as the strict canonical reference. Preserve this exact scene inventory and relative floor plan:
A reception counter: left side, business traveler paying, suitcase nearby.
B bar counter: back center/right, couple ordering drinks, bartender behind counter.
C boutique display shelf: right wall, handbags and small luxury goods.
D arched night city windows: back/right wall, cool blue city light.
E lounge seating cluster: center foreground, blue chairs/sofa and round table.
F concierge/payment counter: right foreground, staff presenting a bill.
G family with shopping bags: near right/front counter.
H solo coffee guest: near central lounge table.
Create the same scene from a [left/right/overhead] camera angle. Change only the camera and visible perspective. Keep every named anchor recognizable and keep relative positions consistent. If an anchor is partially occluded by the new angle, occlude it naturally; do not replace it. No logos, no readable text, no watermark.
```

Prompt shape for a production-stable room workflow:

```text
Step 1: Generate the clean empty room angle pack with no people, no loose props, no bags, no cups, and no service interactions. Preserve architecture and fixed furniture only.
Step 2: Generate transparent prop/NPC packs for people groups, bags, cups, luggage, staff, and service interactions.
Step 3: Place those sprites through `layouts.js` / runtime metadata per camera profile.
```

Prompt shape for a room angle:

```text
Use the provided center-room image as the strict visual reference. Create the same room from a [left/right] camera angle, preserving the exact floor material, wall panels, wallpaper color, trim, window style, lighting color, palette, pixel density, and HD-2D painterly pixel-art finish. Do not redesign the room. Change only the camera angle and visible wall/floor perspective.
```

Prompt shape for a room overhead / top-down proof:

```text
Use the provided room image as the strict canonical reference. Create the same unfurnished room from a high overhead / top-down angle, preserving the exact floor material, wall color, trim, window placement, light temperature, palette, pixel density, and HD-2D painterly pixel-art finish. Do not redesign the room. Change only the camera angle. No furniture, no characters, no text, no watermark.
```

Prompt shape for furniture variants:

```text
Use the provided furniture image as the strict design reference. Create a transparent-background [left-wall-flush/right-wall-flush] perspective variant with the same material, proportions, silhouette language, color palette, pixel density, and lighting. Do not redesign the object. Change only the viewing angle.
```

Prompt shape for an extended furniture angle pack:

```text
Use the provided furniture image as the strict design reference. Create a clean multi-panel angle pack on a perfectly flat solid #ff00ff chroma-key background. Panels: [front, back, left-side, right-side, top-down]. Preserve the same material, proportions, silhouette language, color palette, pixel density, lighting, and identity in every panel. Do not redesign the object. No room, no floor, no cast shadow, no labels, no text, no watermark.
```

## Sheet Splitting Helper

Use `scripts/split_idle_window_sheet.py` for three-panel sheets.
Use `scripts/split_idle_window_grid.py` for arbitrary grid sheets, such as `3x2` NPC/activity cluster sheets.

The helper now performs furniture QC during split:

- removes flat magenta key pixels
- removes opaque magenta fringe near transparent edges
- despills leftover magenta tint near transparent edges
- clears transparent RGB so previews do not show a false magenta background
- prints `corner-alpha`, `opaque-key-pixels`, `removed-fringe-pixels`, and `despilled-fringe-pixels`

If a split output still shows a visible color halo on a dark preview, rerun with a slightly larger `--fringe-radius` before accepting it.

## Variant Readiness Audit

Before generating or registering large furniture variants, run the deterministic queue audit from the Orbit repo root:

```bash
node skills/orbit-idle-window-assets/scripts/audit_idle_window_variants.mjs
```

Use JSON output when another script or agent needs to consume it:

```bash
node skills/orbit-idle-window-assets/scripts/audit_idle_window_variants.mjs --json
```

The audit reads `pwa/js/personalSpace/idleWindow/variantReadiness.js`. Treat queued items as the authoritative next furniture-generation order unless the user deliberately reprioritizes.

Furniture variant sheet:

```bash
py skills/orbit-idle-window-assets/scripts/split_idle_window_sheet.py ^
  --input path/to/desk-sheet.png ^
  --out-dir pwa/assets/personal-space/idle-window/props/office-corner-desk-v3 ^
  --mode furniture ^
  --names left-wall-flush,front,right-wall-flush ^
  --raw-copy pwa/assets/personal-space/idle-window/raw/office-corner-desk-v3-sheet-magenta.png
```

First validated sofa loop:

```bash
py skills/orbit-idle-window-assets/scripts/split_idle_window_sheet.py ^
  --input path/to/office-leather-sofa-variant-sheet-v1.png ^
  --out-dir pwa/assets/personal-space/idle-window/props/office-leather-sofa ^
  --mode furniture ^
  --names left-wall-flush,front-generated,right-wall-flush ^
  --raw-copy pwa/assets/personal-space/idle-window/raw/office-leather-sofa-variant-sheet-v1-magenta.png
```

Keep `front-generated.png` as a QA artifact unless the user explicitly approves replacing the original `prop.png`.

Background camera sheet:

```bash
py skills/orbit-idle-window-assets/scripts/split_idle_window_sheet.py ^
  --input path/to/background-sheet.png ^
  --out-dir pwa/assets/personal-space/idle-window/backgrounds ^
  --mode background ^
  --names office-angle-left,office-angle-center,office-angle-right ^
  --raw-copy pwa/assets/personal-space/idle-window/raw/office-camera-profile-sheet.png
```

Inspect outputs visually after splitting. For furniture, verify transparent corners and no magenta fringe. For backgrounds, verify each panel has stable framing and no unwanted sheet padding.

Grid activity sheet:

```bash
py skills/orbit-idle-window-assets/scripts/split_idle_window_grid.py ^
  --input path/to/activity-cluster-sheet-magenta.png ^
  --out-dir output/hotel-continuity-l123/l3-runtime-accurate/activity-clusters ^
  --cols 3 ^
  --rows 2 ^
  --names reception-payment,bar-order,family-shopping,solo-coffee,concierge-bill,bellhop-luggage ^
  --raw-copy output/hotel-continuity-l123/l3-runtime-accurate/activity-cluster-sheet-raw-magenta.png ^
  --fringe-radius 4 ^
  --fringe-passes 3
```

## Validation Checklist

Run at least:

```bash
npm run lint
npm run test -- tests/unit/personalSpaceIdleWindow.test.js
```

For meaningful runtime changes, also run full tests:

```bash
npm run test
```

When a dev server is available, browser-smoke these behaviors:

- Idle Growth Window and Current Scene Layer both render.
- Overlay opens and edit mode toggles.
- Camera switching swaps the actual background image.
- Camera switching selects the matching large-furniture variant.
- Small props can snap to a valid support surface.
- Moving parent furniture moves attached props and character anchors.
- Collision warnings show without blocking persistence.

## Handoff

Update `tasks.md` for task lifecycle, `CHANGELOG.md` for user-facing changes, and `pwa/assets/personal-space/idle-window/README.md` for asset provenance/QC notes. Keep generated raw sheets only as references; runtime paths should point to trimmed production PNGs.
