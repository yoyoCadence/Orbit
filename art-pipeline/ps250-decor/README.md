# PS-250F decorations

The six decorations the user chose on 2026-10-22, each switched on and off in Edit Mode:

| id | Name | Stands on | Shown from |
|---|---|---|---|
| `deco-trophy` | 獎盃 | the shelf | 50% (with the shelf) |
| `deco-globe` | 地球儀 | the shelf | 50% |
| `deco-beanbag` | 懶骨頭 | the floor, front left | 0% |
| `deco-floor-lamp` | 落地燈 | the floor, back left corner | 0% |
| `deco-succulent` | 多肉盆栽 | the desk | 25% (with the desk) |
| `deco-coffee` | 咖啡杯組 | the desk (walnut tray, pour-over, two mugs) | 25% |

The models are in `ps244-blender/scene.py` (`DECOR_IDS`, `DECOR_BUILDERS`), next to the furniture they stand on, so they share its camera, lights and toon materials. `render_pack.py` renders each one alone.

## Files

| File | Role |
|---|---|
| `process_decor.py` | Trims the renders, writes the runtime sprites, `placements.json`, `outputs.json` and `DECOR_DEFINITIONS` in `assetManifest.js`, and the previews |
| `placements.json` | Trim box and runtime placement of each decoration, by day and by night (`night`). `tests/unit/ps250fDecorations.test.js` keeps it in sync with `DECOR_DEFINITIONS` |
| `outputs.json` | Size and SHA-256 of every runtime file, and (`clipped`) how many visible pixels the cut of each Q-style room-style decoration dropped; the same test checks the files against it |
| `previews/` | Default room: `decor[-night]-phase-*.jpg`, the committed room of each phase where decorations appear, with every decoration and the default pair (Q style), and `decor[-night]-pixel-phase-100.png`. Room styles (PS-250F2): `<style>[-night][-pixel]-phase-100.jpg` |

Runtime files: `pwa/assets/personal-space/v2/workspace/decor/<id>[-night].png` (Q style) and `pwa/assets/personal-space/v2/workspace/pixel/decor/<id>[-night].png` (pixel); a room style's under `decor/styles/<style>/` in each.

## Reproduce

```bash
# Q style, about 35 minutes per lighting on 4 cores (one full frame per decoration).
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/decor/q-day --only decor
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/decor/q-night --only decor --lighting night
# Pixel, a few minutes per lighting.
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/decor/pixel --only decor
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/decor/pixel --only decor --lighting night

# Either order: the second pass, once both lightings are in placements.json, rewrites DECOR_DEFINITIONS.
/tmp/bpyenv/bin/python art-pipeline/ps250-decor/process_decor.py /tmp/decor/q-day /tmp/decor/pixel --write-runtime
/tmp/bpyenv/bin/python art-pipeline/ps250-decor/process_decor.py /tmp/decor/q-night /tmp/decor/pixel --lighting night --write-runtime

# A room style (PS-250F2): only the default boxes are rendered (--decor-boxes),
# about 5 minutes per lighting for the Q style and 2 for the pixels.
B=art-pipeline/ps250-decor/placements.json
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/decor/nordic-day --only decor --style nordic --decor-boxes $B
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/decor/pixel --only decor --style nordic --decor-boxes $B
/tmp/bpyenv/bin/python art-pipeline/ps250-decor/process_decor.py /tmp/decor/nordic-day /tmp/decor/pixel --style nordic --write-runtime
# ... and the same with --lighting night, for each of nordic, washitsu, nightowl, study.
```

## Design decisions

- **One sprite per decoration.** A decoration is rendered alone, with the furniture it stands on as a shadow catcher (so its contact shadow lands on the shelf or desk) and every other prop hidden. The room and prop renders hide every decoration, so they are unchanged and every decoration can be switched off.
- **Trimmed like a prop.** `process_pack.trim_prop` (solid core, shadow margin, sampling noise dropped); the trim box gives the placement, and a night decoration has its own box because its shadows fall another way. The pixel sprite is cut to the Q-style box, so both styles share the placements.
- **Draw order.** Only the furniture a decoration stands on overlaps it, so each is drawn just above its support: the shelf items at 23 (shelf 22), the desk items at 25 (desk 24), the floor lamp at 21 and the beanbag at 31 (in front of the chair, 30; below the characters, 40 and 42).
- **It moves with its support.** A placement override of the shelf or desk moves the decorations on it by the same offset. V2 does not apply overrides today (PS-246); this keeps the two together if it ever does.
- **The floor lamp lights nothing else.** Its shade glows at night, but a light in the shared room render would change the room whether or not the lamp is shown.
- **Hidden, not shown.** The device stores the decorations switched off (`world.hiddenDecorations`), so every decoration is shown by default, and one added later appears without a choice.
- **Precached.** The default room's decorations (Q style, by day and by night) are in `sw.js` SHELL, under the approved PS-250 rule that only the defaults are precached. The pixel ones and the room styles' are downloaded the first time they are shown. Offline, one that was never downloaded is drawn as the default room's (Q style, then by day), in the poster and in Pixi alike; one that loads nowhere is left out and the room stays as it is.
- **Room styles (PS-250F2).** The same models with the style's materials (a walnut tray or brass trophy becomes the style's wood or metal). Like the style props (`ps250-rooms`), each is cut to the default decoration's box of the same lighting after the style's `shadow_floor`, and gets the style's pixel shadow, so every room shares `DECOR_DEFINITIONS`. The cut drops at most 366 visible pixels (a faint shadow tail under the Nordic beanbag at night), except the night-owl floor lamp (277 by day, 729 at night). Most of those are the pole's shadow, cast by the neon rail onto the near-black wall outside the box, where it cannot be seen. The rest is the lamp base's contact shadow, which in that room runs a few pixels past the bottom of the box: a hard edge about 1 px tall at runtime size. `clipped` counts only what was rendered, the box plus 48 px; `process_decor.py` notes any decoration whose shadow reaches the edge of that ring (none does). Since the result is cut to that box anyway, `render_pack.py --decor-boxes` renders only the box plus 48 px (a render border; the rest of the frame stays transparent): about 5 minutes per lighting instead of 35. A border render matches a full-frame one to sampling noise (same trim box; solid pixels differ by about 1 of 255 on average).
- **Only on request.** `render_pack.py` renders decorations only when `--only` names them (or `decor`), so a full pack is still the room and the props.
