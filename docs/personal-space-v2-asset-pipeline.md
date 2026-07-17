# Personal Space V2 Asset Pipeline

## Purpose

This document defines the production path for the Personal Space V2 vertical slice. The first target is one canonical Building-stage workspace that remains legible inside the home `Orbit Window` and the full Personal Space view.

The pipeline optimizes for controlled continuity, mobile readability, traceable licensing, and reversible integration. Asset volume is not a success metric.

## Relationship To The Existing Idle Window

The repository already contains an additive legacy Idle Growth Window with 16:9 `left / center / right` camera packs, furniture variants, placement planes, support surfaces, footprints, and character anchors.

V2 does not delete those assets or contracts. It changes the first validation target:

- one canonical 3/4 camera for the V2 room;
- a 3:2 safe composition for the home Orbit Window;
- the same world state rendered in `home-window`, `full-world`, and `edit` presentation modes;
- large furniture constrained by authored slots or legal placement zones;
- small props free-moving with support-surface snapping;
- no requirement to generate three views of every new V2 asset before gameplay is proven.

Existing multi-camera assets remain valid legacy/provenance material and may be reused when their perspective fits the canonical V2 camera.

## Canonical Output Contract

| Output | Logical size | Production size | Notes |
|---|---:|---:|---|
| Home Orbit Window | 960 × 640 | 1920 × 1280 | 3:2, safe composition is mandatory |
| Full World room | 960 × 640 logical baseline | 1920 × 1280 or larger | May letterbox or expand vertically; do not crop critical actors |
| Transparent prop | native authored bounds | 2× runtime display size | No baked floor shadow |
| Character frame | action-dependent | 2× runtime display size | Clear silhouette at card scale |
| Lighting overlay | 960 × 640 | 1920 × 1280 | Transparent PNG/WebP as appropriate |

Safe composition must keep the protagonist, Companion, Active Project object, and the current world change inside the central 80% width and 78% height. Decorative edges may crop responsively.

## Repository Layout

```text
art-pipeline/
├── comfyui/
│   ├── workflows/
│   │   ├── room-shell-v1.json
│   │   ├── large-prop-v1.json
│   │   ├── small-prop-v1.json
│   │   └── character-action-v1.json
│   ├── model-manifest.json
│   └── README.md
├── blender/
│   ├── orbit-room-template.blend
│   ├── camera-contract.md
│   └── export-presets/
├── scripts/
│   ├── validate-assets.mjs
│   ├── trim-alpha.py
│   ├── build-atlas.mjs
│   └── generate-registry.mjs
└── references/
    ├── palette/
    ├── character/
    ├── materials/
    └── approved-assets/

pwa/assets/personal-space/v2/
├── building-workspace/
│   ├── backgrounds/
│   ├── lighting/
│   ├── props/
│   ├── protagonist/
│   ├── companion/
│   └── atlas/
└── README.md
```

`art-pipeline/` contains sources and reproducibility metadata. Only reviewed runtime outputs belong under `pwa/assets/`.

## Production Sequence

1. Approve the art bible, canonical camera, room dimensions, palette, and safe composition.
2. Build a simple Blender blockout for the workspace shell and the five Project stages.
3. Export depth, normal, line-art, object masks, and a neutral shadow reference.
4. Generate the empty room shell from controlled references.
5. Generate large props from blockout renders and approved material references.
6. Generate small props on flat `#ff00ff`, then chroma-key, despill, trim, and inspect them locally.
7. Generate protagonist and Companion identity sheets before action frames.
8. Produce only the vertical-slice action set.
9. Assemble atlases and a deterministic asset registry.
10. Verify card-scale readability, alpha edges, memory use, fallback behavior, and license provenance.
11. Register accepted assets and mark proofs explicitly; never point production state at raw generation output.

## Blender Contract

Blender is the geometry and camera source of truth, not necessarily the final runtime renderer.

The template must lock:

- room footprint and wall height;
- near-orthographic 3/4 camera and focal length;
- the 3:2 safe composition guides;
- floor, wall, desk, window, and door landmarks;
- protagonist and Companion scale references;
- legal large-furniture slots;
- small-prop support surfaces;
- lighting direction for day and night overlays.

Exports must use stable filenames and identical camera transforms across Project stages.

## Controlled ComfyUI Workflows

### `room-shell-v1`

Inputs:

- Blender depth and line art;
- approved Building-stage palette;
- room identity reference;
- lighting reference;
- negative constraints: no character, Companion, loose prop, readable text, logo, or watermark.

Output: an empty, fixed-camera workspace shell. Architecture and large fixed landmarks must not drift between day/night or Project variants.

### `large-prop-v1`

Inputs:

- Blender prop render in the canonical camera;
- approved material and palette references;
- scale card;
- named silhouette constraints.

Output: a transparent canonical-perspective prop with no baked floor shadow. Additional perspectives are generated only when an implemented placement rule requires them.

### `small-prop-v1`

Inputs:

- silhouette;
- material;
- palette;
- scale category;
- perfectly flat `#ff00ff` background.

Output: a clean mobile-readable prop. Use the existing idle-window split/chroma helpers where applicable, then inspect on light and dark backgrounds.

### `character-action-v1`

Inputs:

- approved identity sheet;
- pose/storyboard reference;
- action name and facing;
- frame count and timing.

Initial protagonist actions:

```text
idle, work, celebrate, rest, walk, inspect
```

Initial Companion actions:

```text
observe, approach, congratulate, rest
```

Output is a draft sheet. Frame continuity, silhouette, clothing, face, scale, and foot anchoring require manual QA.

## Project Stage Asset Strategy

`Workspace Upgrade` uses five discrete visual stages rather than continuous generation:

| Progress | Required visual change |
|---:|---|
| 0% | empty work corner |
| 25% | basic desk |
| 50% | task light and storage |
| 75% | single monitor and planning board |
| 100% | dual-monitor formal workstation |

Prefer additive runtime layers so each milestone introduces or upgrades named props. Do not generate five unrelated full-room paintings.

## Registry Metadata

Every accepted asset entry must include at least:

```js
{
  id,
  label,
  role,
  path,
  dimensions,
  canonicalCameraId: 'building-workspace-v1',
  projectPhase,
  source,
  qc,
  licenseRef,
  status: 'production' | 'production-proof' | 'angle-proof'
}
```

Furniture metadata may additionally include `footprint`, `placementPlaneId`, `supportSurfaces`, `characterAnchors`, and legal slot ids. Character animation contracts remain separate from furniture anchors.

## Model Manifest And Licensing

Every model, LoRA, ControlNet, custom node, reference pack, or external texture must be recorded:

```json
{
  "model": "",
  "version": "",
  "source": "",
  "license": "",
  "commercialUse": "",
  "hash": "",
  "workflowVersion": "",
  "notes": ""
}
```

Unknown source or unclear commercial rights means rejection from production. Generated output must not contain logos, readable brand text, signatures, or watermarks.

## Automated Validation

`validate-assets.mjs` should fail on:

- missing registry file paths;
- dimensions outside the declared contract;
- opaque corners on assets declared transparent;
- runtime files still containing the chroma-key color at opaque edges;
- duplicate ids;
- missing provenance, QC, or license references;
- Project stage assets with non-monotonic phase metadata;
- an atlas frame outside its source bounds.

The atlas build must be deterministic for identical inputs.

## Manual QA Checklist

- Inspect each asset at 100%, 50%, and the real home-card size.
- Preview transparent assets against black, white, and room-color backgrounds.
- Confirm the room is recognizably identical across lighting overlays and Project stages.
- Confirm protagonist and Companion remain distinct at mobile size.
- Confirm the Project change is visible without explanatory text.
- Confirm furniture perspective matches the canonical floor and wall planes.
- Confirm no critical object lies outside the safe composition.
- Confirm reduced-motion presentation still communicates the same state change.
- Record accepted/rejected status and reason in the asset README.

## Vertical Slice Asset Budget

The first validated set is capped at:

- one canonical room background;
- one exterior/window background;
- day and night lighting overlays;
- 8–12 furniture/prop assets;
- one protagonist identity with 5–6 actions;
- one Companion identity with 3–4 actions;
- five Workspace Upgrade stages;
- two weather overlays;
- 8–10 interaction definitions, which may reuse existing visuals.

Do not expand Survival/Mastery rooms or mass-generate furniture until the home-to-Session-to-world loop passes product and performance validation.

## Acceptance Criteria

- The same accepted assets render in home and full-world presentation modes.
- Home framing is 3:2 and retains all critical actors at supported widths.
- Project stages are visibly cumulative and driven by state, not hardcoded screenshots.
- Runtime props have clean alpha and correct placement metadata.
- Source, workflow, license, hash, and QC status are traceable.
- Raw/proof output is separated from production assets.
- Legacy idle-window assets and provenance remain intact.
