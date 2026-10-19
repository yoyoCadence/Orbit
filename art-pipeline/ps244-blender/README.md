# PS-244 Blender workstation pipeline

Procedural Blender source for the Personal Space V2 **Building Formal Workstation**: the room background and all eight Workspace Upgrade props. It replaces the PS-242 painted room and the reused legacy idle-window pixel props, which differed in style, perspective and scale and had no contact shadows.

Everything is generated from code. There are no external models, textures or HDRIs, and no generated images feed in.

## Files

| File | Role |
|---|---|
| `scene.py` | Builds the room, props, toon materials, Freestyle outlines, lights and the canonical camera (`building-workspace-v2`) |
| `render_pack.py` | Renders `room.png` (transparent film) and each prop, with room surfaces and its support surface as shadow catchers and any occluding prop as a holdout (PS-247) |
| `process_pack.py` | Composites the room over the backdrop → WebP. Trims props (noise floor plus speck filter) → PNG. Writes `placements.json`, rewrites `PROP_DEFINITIONS` in `assetManifest.js`, and renders per-phase QA previews (with the HW-105 photo frame) |
| `placements.json` | Placement of every prop as measured from its trimmed render; `assetManifest.js` must match it (`tests/unit/ps244WorkspacePlacements.test.js`) |
| `model-manifest.json` | Generator, version, license and processing provenance |
| `previews/phase-*.jpg` | Composites for each project phase (0/25/50/75/100) with the protagonist and Companion at runtime placements |

## Reproduce

```bash
# One environment for both steps. Python 3.13; bpy is Blender as a Python
# module (Cycles CPU + OpenImageDenoise). Pillow and NumPy are pinned to the
# versions that produced the committed assets.
python3 -m venv /tmp/bpyenv
/tmp/bpyenv/bin/pip install bpy==5.2.2 pillow==12.3.0 numpy==2.5.3

/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/ps244-renders --width 1536 --samples 96
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/process_pack.py /tmp/ps244-renders --write-runtime
npm run ps242:manifest && npm run ps243:assets
```

The full pack (room plus 8 props, 1536×1024, 96 samples) takes roughly 30–50 minutes on a 4-core CPU (PS-245 measured about 31 minutes). `--width 768 --samples 24` gives a 3-minute draft for composition checks. Cycles is seeded (`scene.cycles.seed = 244`), but a rerun on another machine is not byte-identical: props differ by sampling noise, and a trim box can move by 1 px (PS-247 saw the desk and shelf shift by 1 px). When re-rendering to change one prop, use `--only`, run `process_pack.py --write-runtime`, then restore the untouched props' PNGs and their `placements.json` entries (and `PROP_DEFINITIONS`) from git, and redraw the previews from the lossless room composite so that unchanged phases stay byte-identical.

## Design decisions

- **One camera for everything.** Props are rendered full-frame from the canonical camera, then trimmed. Their placement (centre x, bottom y, width; % of frame) comes from the trimmed box, so the runtime draws each prop exactly where it sat in 3D. Since PS-246 V2 does not apply placement overrides and Edit Mode cannot move them, which the occluders below rely on.
- **Contact shadows travel with the prop.** In prop renders the floor, walls, invisible ceiling and the prop's support (the desk, for monitors and the lamp) are shadow catchers. Shadows are therefore baked into the prop PNG and move with it.
- **Occluders (PS-247).** A prop that sits partly behind a prop drawn under it at runtime is rendered with that prop present as an occluder (`PROP_OCCLUDERS` in `scene.py`). The occluder gets a Holdout material, so the hidden parts become transparent in the PNG and the runtime shows the occluder through them. Its shadows, bounces and outlines are turned off so nothing is baked in twice. It is a material rather than the object-level `is_holdout`, because Freestyle leaves holdout objects out of its visibility test and would still outline the hidden edges. Today only the office chair uses it: its right armrest and one caster are behind the desk's side cabinet. This relies on the two props always being on screen together at fixed positions; both enter at 25% and V2 placements are fixed since PS-246.
- **Character scale.** The camera is calibrated so a 1.7 m figure at the protagonist's floor position matches the chibi sprite drawn at 24% width (Companion 13%). Before PS-244 the sprites were 17% / 9%.
- **Style.** A Toon BSDF blended with a weaker Principled BSDF, plus thin navy Freestyle outlines, gives the Premium Illustrated Diorama read from the art bible. Pixel-art characters on a lit 3D diorama follow the HD-2D convention.
- **Construction detail (PS-245).** Props are built the way the real objects are put together, so they read as furniture rather than blocks:
  - **Desk:** an edge-banded top, inset drawers with bar handles, a cabinet door, steel legs on rubber feet, and a cable tray.
  - **Chair:** a curved mesh back with lumbar pad and headrest, armrests, and casters.
  - **Keyboard and screens:** individual keycaps; the screens are drawn with numpy as a code editor and a light dashboard.
  - **Room:** wood grain, a rug under the characters, panel mouldings, sconces under each light pool, a clock, outlets, roller blinds and a curtain.

  Everything stays on the camera from PS-244, so character scale did not change. The fixed wall overlay of the achievement frame (`top:20% left:47%`; on phones up to x 60.5%, y 36%) is kept clear.
- **Diorama framing.** The front wall and ceiling are cut away. Everything outside the window is confined to the camera's view cone through the window, and holdouts keep anything below the floor line out of frame. The empty area around the room is a designed navy backdrop added in `process_pack.py`.

## Not in scope

- No 3D runtime: the app still draws 2D sprites with Pixi, and the JS budget is unchanged.
- The protagonist, Companion and weather overlays are the PS-242 assets.
- Legacy idle-window props under `pwa/assets/personal-space/idle-window/` are kept unchanged for legacy mode.
