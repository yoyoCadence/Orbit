# Idle Window Furniture Variant Spec

This document defines how idle-window prop assets should be named, registered, and placed.

## Asset Layout

Production furniture variants live under:

```text
pwa/assets/personal-space/idle-window/props/<asset-id>/<variant-id>.png
```

Raw sheets can be kept under:

```text
pwa/assets/personal-space/idle-window/raw/
```

Raw files are references only. Runtime code should point to trimmed PNGs with transparent backgrounds.

## Variant Naming

Use stable semantic variant ids:

- `front`: center/default readable view.
- `left-wall-flush`: authored view that can align to left wall geometry.
- `right-wall-flush`: authored view that can align to right wall geometry.

Do not mark mirrored or CSS-rotated art as final. Use `status: "prototype-mirror"` or `status: "needs-generated-perspective-art"` until replaced by authored pixels.

## Registry Requirements

Each prop registry entry should include:

- `id`
- `label`
- `path`
- `dimensions`
- `source`
- `qc`
- `variants`

Each variant should include:

- `id`
- `label`
- `path`
- `dimensions`
- `cameraProfileId` when it is intended to pair with a camera profile.
- `status`, such as `perspective-correct`, `prototype-mirror`, or `source`.

## Placement Metadata

Large props should define:

- `placementPlaneId`
- `footprint`
- `supportSurfaces` if other props can sit on them.
- `characterAnchors` when the protagonist can stand, sit, work, browse, or look near the item.

Small props should define:

- `editing.allowedSurfaceKinds`
- `footprint`
- optional default `parentItemId` / `surfaceId`

## Support Surface Coordinates

Support surfaces are parent-relative percent offsets from the parent placement point:

```js
supportSurface({
  id: 'desktop',
  kind: 'tabletop',
  bounds: { minX: -12, maxX: 10, minY: -19, maxY: -10 },
})
```

Runtime resolves these into absolute stage coordinates, then persists child props as `localX` and `localY`. This allows a cup, lamp, or plant to follow a moved desk or shelf.

## Character Anchors

Character anchors are also parent-relative:

```js
characterAnchor({
  id: 'desk-work',
  offsetX: 12,
  offsetY: 5,
  width: 14,
  facing: 'front',
})
```

The character sprite contract remains separate from furniture art. Anchors only decide where the current sprite should stand or animate.
