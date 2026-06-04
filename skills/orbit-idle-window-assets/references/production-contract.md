# Orbit Idle Window Production Contract

## Purpose

The idle window is an additive Personal Space presentation. It visualizes self-growth like a refined idle mobile game window while preserving the existing 2D scene display and future 3D runtime.

## Visual Target

- Use HD-2D-inspired pixel art with crisp silhouettes, readable pixel structure, painterly light, and believable perspective.
- Keep compositions legible at card size and rich enough for fullscreen landscape editing.
- Runtime transforms can polish placement, but cannot replace authored perspective.

## Camera Profiles

Every production room background set should provide:

- `left`: left wall/floor perspective is dominant.
- `center`: neutral default view.
- `right`: right wall/floor perspective is dominant.

Each profile must be a real background image. Do not ship a shifted copy as final camera art. Target strict 16:9 framing to match `.space-idle-window-frame`.

All profiles in a set must be generated as controlled variants of the same room. Use the approved `center` image as the reference for `left` and `right`; do not generate the angles from separate text-only prompts. Reject variants if they change floor material, wall panels, wallpaper/paint, trim, window design, lighting temperature, or overall room identity.

## Angle Packs

The long-term art-production target is one approved reference image producing a stable angle family.
This applies to both objects and backgrounds.

Continuity levels:

- `L0 style-family`: same genre and palette only.
- `L1 room-identity`: same room language, material families, and major zones.
- `L2 landmark-locked`: named zones, large furniture, and activity clusters preserve relative positions across angles.
- `L3 runtime-accurate`: empty background angle packs plus separate runtime props/NPCs for all people, loose objects, and interactions.

Use `L2` for proving a same-scene angle pack. Use `L3` for production when users need stable object placement, editable props, or consistent people across camera profiles.

Runtime camera profiles:

- `left`
- `center`
- `right`

Extended background angle proofs:

- `overhead`: high camera looking down into the same room.
- `top-down`: stronger plan-view camera, useful for future placement maps.
- `isometric`: tactical / room-planning angle if a future view needs it.
- `plan-view`: readable layout reference, not necessarily a final scenic background.

Extended furniture angle proofs:

- `front`
- `back`
- `left-side`
- `right-side`
- `three-quarter-left`
- `three-quarter-right`
- `top-down`

Do not wire extended angles into `layouts.js` until the runtime has a matching interaction model. Register them as `role: 'angle-proof'` or document them as provenance when they are feasibility samples.

For a castle, building facade, or other large location asset, the same rule applies: approve the front reference first, then generate side and overhead/top-down views that preserve architecture, materials, lighting, palette, scale, and pixel density. A top view may reveal new roof/floor information, but it should not become a different building.

For busy scenes with people consuming services, do not rely on a single baked image if exact continuity matters. The model can preserve the broad hotel / shop / lounge identity, but it may re-author people, counters, tables, bags, and service clusters between views. Prefer:

1. Clean empty room angle pack.
2. Fixed furniture and counter variants.
3. Transparent NPC / prop / activity clusters.
4. Per-camera placement metadata in the runtime.

If a baked scene proof is still needed, write a landmark inventory first and reject outputs that move or swap named anchors.

## Furniture Variants

Use stable semantic ids:

- `front`: center/default readable view.
- `left-wall-flush`: authored view for left-wall alignment.
- `right-wall-flush`: authored view for right-wall alignment.

Variant registry entries should include:

- `id`
- `label`
- `path`
- `dimensions`
- `cameraProfileId` when paired with a camera
- `status`, such as `perspective-correct`, `prototype-mirror`, `production-proof`, or `needs-generated-perspective-art`

Large furniture variants should be generated from the approved `front` asset as the strict reference. The variant may change perspective only; material, palette, silhouette language, pixel density, lighting, and object identity must remain stable.

If a multi-panel furniture sheet uses a chroma-key background, split it with `scripts/split_idle_window_sheet.py` rather than manual cropping. The helper removes flat magenta, clears transparent RGB, and cleans magenta fringe near alpha edges. Do not accept a sheet if a dark-preview halo remains obvious.

## Reference Provenance

Every production background set or furniture variant set should record:

- canonical reference path
- generated output path
- accepted/rejected status
- known consistency issues
- whether the runtime asset is final, production-proof, or needs another generated perspective pass

When adding future furniture, prefer this chain:

1. Generate one approved `front` asset.
2. Generate `left-wall-flush` and `right-wall-flush` from that image reference.
3. Optionally generate extended angles such as `back`, `left-side`, `right-side`, or `top-down` as `angle-proof` artifacts when future editing needs them.
4. Register all runtime variants together with `cameraProfileId` when paired to camera profiles.
5. Place with footprint/support-surface metadata only after the variants pass visual consistency review.

## Placement Model

Coordinates are percent-based with top-left origin.

Common placement data:

```js
placement: place({ x: 42, y: 83, width: 33, z: 24, anchor: 'center-bottom' })
placementPlaneId: 'floor-main'
footprint: footprint({ width: 33, depth: 18, height: 20 })
```

Planes are editing aids:

- `wall-*`: flat wall props.
- `floor-*`: furniture bases and character standing areas.
- support surfaces: parent-relative tabletops, shelves, ledges, and similar surfaces.

## Support Surfaces

Support surfaces are parent-relative percent offsets from the parent placement point.

```js
supportSurface({
  id: 'desktop',
  label: 'Desktop',
  kind: 'tabletop',
  bounds: { minX: -12, maxX: 10, minY: -19, maxY: -10 },
})
```

Small props should store `parentItemId`, `surfaceId`, `localX`, and `localY` when attached, so they follow moved furniture.

Eligible small props should define:

```js
editing: edit({
  canRotate: true,
  canChangeVariant: true,
  allowedSurfaceKinds: ['tabletop', 'shelf'],
})
```

## Character Anchors

Character anchors are parent-relative and do not change the sprite contract.

```js
characterAnchors: [
  characterAnchor({
    id: 'desk-work',
    label: 'Work',
    offsetX: 12,
    offsetY: 5,
    width: 14,
    facing: 'front',
  }),
]
```

The character layer can reference an anchor:

```js
anchorTarget: { itemId: 'corner-desk', anchorId: 'desk-work' }
```

## Scale Targets

- Protagonist width: about 12-15% of stage width.
- Desks/sofas: about 28-38%.
- Shelves/cabinets: about 10-18%.
- Tabletop props: about 4-8%.

## Shadows And Lighting

- Backgrounds carry the primary room lighting.
- Props should avoid baked floor shadows that break rearrangement.
- Runtime drop shadows are allowed for coherence, not for fixing bad perspective.

## Acceptance Checks

- Camera switching changes actual background image paths.
- At least one large furniture item has true left/center/right variants.
- Small props can detach, move freely, and snap to another valid surface.
- Parent movement updates child props and character anchors.
- Overlap warnings are visible but do not block all creative placement.
- Unit tests cover asset resolution, state separation, renderer data attributes, and placement math.
