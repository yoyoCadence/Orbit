# PS-244 Blender workstation pipeline

Procedural Blender source for the Personal Space V2 **Building Formal Workstation**: the room background and all eight Workspace Upgrade props. It replaces the PS-242 painted room and the reused legacy idle-window pixel props, which differed in style, perspective and scale and had no contact shadows.

Everything is generated from code. There are no external models, textures or HDRIs, and no generated images feed in.

## Files

| File | Role |
|---|---|
| `scene.py` | Builds the room, props, toon materials, Freestyle outlines, lights and the canonical camera (`building-workspace-v2`) |
| `render_pack.py` | Renders `room.png` (transparent film) and each prop, with room surfaces and its support surface as shadow catchers and any occluding prop as a holdout (PS-247) |
| `process_pack.py` | Composites the room over the backdrop → WebP. Trims props (noise floor plus speck filter) → PNG. Writes `placements.json`, rewrites `PROP_DEFINITIONS` in `assetManifest.js`, and renders per-phase QA previews (with the HW-105 photo frame) |
| `placements.json` | Placement of every prop as measured from its trimmed render, by day (top level) and by night (`night`, PS-250E1); `assetManifest.js` must match it (`tests/unit/ps244WorkspacePlacements.test.js`, `ps250e1NightRoom.test.js`) |
| `model-manifest.json` | Generator, version, license and processing provenance |
| `previews/phase-*.jpg` | Composites for each project phase (0/25/50/75/100) with the protagonist and Companion at runtime placements. They predate PS-250B and show the PS-242 pixel pair |
| `previews/night-phase-*.jpg` | The same for the night lighting (PS-250E1), with the default Q-style pair and the dimmed photo frame |

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

# PS-250E1 night lighting: a separate render directory. --lighting night writes
# the -night files and the "night" placements and keeps the day data as it is.
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/ps244-night --lighting night
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/process_pack.py /tmp/ps244-night --write-runtime --lighting night
```

The full pack (room plus 8 props, 1536×1024, 96 samples) takes roughly 30–50 minutes on a 4-core CPU (PS-245 measured about 31 minutes). `--width 768 --samples 24` gives a 3-minute draft for composition checks. Cycles is seeded (`scene.cycles.seed = 244`), but reruns are not byte-identical, even with the same command on the same machine. Props differ by sampling noise, and a trim box can move by 1 px; PS-247 saw the desk and shelf shift by 1 px. To change one prop:

1. Render the full pack once into a directory. `process_pack.py` always reads `room.png` and all eight prop renders.
2. Re-render the changed prop into that same directory with `--only <id>`, using the same `--width` and `--samples` as the full render.
3. Run `process_pack.py --write-runtime`.
4. Restore from git everything that should not change:
   - the other props' PNGs;
   - their `placements.json` entries and `PROP_DEFINITIONS`;
   - the background WebP, which `--write-runtime` re-encodes.
5. Redraw the previews from the lossless room composite, so that unchanged phases stay byte-identical.

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

## Night lighting (PS-250E1)

The user chose a night version of the room for the evening and the night (17:00–05:00, the `evening` and `night` time bands), on 2026-10-21. Before, the night was the day render under a dark overlay, so the sunlight still showed.

- **Same scene, other lights.** `scene.py` takes `lighting='night'`. Geometry, camera, materials and outlines are the same. There is no sun, so no shadow falls to the left; the four sconces are the key light and their shades glow; a dim cool fill and a darker world keep the room readable. The sky is a deep navy gradient and half of the skyline's window rows are lit. The desk lamp bulb and the screens glow as by day. `day` is unchanged.
- **Re-run both.** `--lighting night` keeps the day data and a day run keeps the night data, so after a scene edit render and process both lightings; otherwise the other lighting's placements are stale. `PROP_DEFINITIONS` needs both, and a run fails loudly when the other one is missing.
- **Own trim boxes.** The sconces stand behind the furniture, so night shadows fall toward the camera and spread in a fan. A night prop therefore has its own trim box and placement (`placements.json` → `night`). The day boxes, placements and files are unchanged. At runtime a night prop shares its day twin's draw order.
- **Only within their outline.** Lamp and screen light is not cast on the desk or the wall: props are rendered on shadow catchers, which record shadows, not light, and the room is shared by every phase. A glow would need a separate additive layer (not done).
- **Runtime.** `getWorkspaceSceneAssets()` picks the night room and props from a `timeBand` option and reports `lighting: 'night'`. The poster and Pixi then use a weaker night layer (the characters and weather still need it), and the poster dims the achievement frame with its photo.

## Window view by time band (PS-251B)

The morning and evening views outside the window are overlays rendered from this scene by `art-pipeline/ps251-window/` (the user's choice on 2026-10-23). By day and at night the view stays baked into the room. A change to the window, the camera or the skyline (`build_room()`, `SKY`, `SKYLINE`) needs those overlays rendered again; a change to anything else in the room does not.

## Not in scope

- No 3D runtime: the app still draws 2D sprites with Pixi, and the JS budget is unchanged.
- The protagonist, Companion and weather overlays are the PS-242 assets.
- Legacy idle-window props under `pwa/assets/personal-space/idle-window/` are kept unchanged for legacy mode.
