# PS-244 Blender workstation pipeline

Procedural Blender source for the Personal Space V2 **Building Formal Workstation**: the room background and all eight Workspace Upgrade props. It replaces the PS-242 painted room and the reused legacy idle-window pixel props, which differed in style, perspective and scale and had no contact shadows.

Everything is generated from code. There are no external models, textures or HDRIs, and no generated images feed in.

## Files

| File | Role |
|---|---|
| `scene.py` | Builds the room, props, toon materials, Freestyle outlines, lights and the canonical camera (`building-workspace-v2`) |
| `render_pack.py` | Renders `room.png` (transparent film) and each prop alone, with room surfaces and its support surface as shadow catchers |
| `process_pack.py` | Composites the room over the backdrop → WebP. Trims props (noise floor plus speck filter) → PNG. Writes `placements.json` and per-phase QA previews |
| `placements.json` | Placement of every prop as measured from its trimmed render; `assetManifest.js` must match it (`tests/unit/ps244WorkspacePlacements.test.js`) |
| `model-manifest.json` | Generator, version, license and processing provenance |
| `previews/phase-*.jpg` | Composites for each project phase (0/25/50/75/100) with the protagonist and Companion at runtime placements |

## Reproduce

```bash
# Blender as a Python module (Cycles CPU + OpenImageDenoise); needs Python 3.13
python3 -m venv /tmp/bpyenv && /tmp/bpyenv/bin/pip install bpy==5.2.2

/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/ps244-renders --width 1536 --samples 96
python3 art-pipeline/ps244-blender/process_pack.py /tmp/ps244-renders --write-runtime
# then copy placements.json values into PROP_DEFINITIONS in assetManifest.js
npm run ps242:manifest && npm run ps243:assets
```

The full pack (room plus 8 props, 1536×1024, 96 samples) takes roughly 30–45 minutes on a 4-core CPU. `--width 768 --samples 24` gives a 3-minute draft for composition checks. Cycles is seeded (`scene.cycles.seed = 244`), so reruns on the same Blender version reproduce the same frames.

## Design decisions

- **One camera for everything.** Props are rendered full-frame from the canonical camera, then trimmed. Their placement (centre x, bottom y, width; % of frame) comes from the trimmed box, so the runtime draws each prop exactly where it sat in 3D. Edit Mode can still move them.
- **Contact shadows travel with the prop.** In prop renders the floor, walls, invisible ceiling and the prop's support (the desk, for monitors and the lamp) are shadow catchers. Shadows are therefore baked into the prop PNG and move with it.
- **Character scale.** The camera is calibrated so a 1.7 m figure at the protagonist's floor position matches the chibi sprite drawn at 24% width (Companion 13%). Before PS-244 the sprites were 17% / 9%.
- **Style.** A Toon BSDF blended with a weaker Principled BSDF, plus thin navy Freestyle outlines, gives the Premium Illustrated Diorama read from the art bible. Pixel-art characters on a lit 3D diorama follow the HD-2D convention.
- **Diorama framing.** The front wall and ceiling are cut away. Everything outside the window is confined to the camera's view cone through the window, and holdouts keep anything below the floor line out of frame. The empty area around the room is a designed navy backdrop added in `process_pack.py`.

## Not in scope

- No 3D runtime: the app still draws 2D sprites with Pixi, and the JS budget is unchanged.
- The protagonist, Companion and weather overlays are the PS-242 assets.
- Legacy idle-window props under `pwa/assets/personal-space/idle-window/` are kept unchanged for legacy mode.
