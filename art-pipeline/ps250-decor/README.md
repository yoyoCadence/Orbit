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
| `outputs.json` | Size and SHA-256 of every runtime file; the same test checks the files against it |
| `previews/` | `decor[-night]-phase-*.jpg`: the committed room of each phase where decorations appear, with every decoration and the default pair (Q style); `decor[-night]-pixel-phase-100.png` |

Runtime files: `pwa/assets/personal-space/v2/workspace/decor/<id>[-night].png` (Q style) and `pwa/assets/personal-space/v2/workspace/pixel/decor/<id>[-night].png` (pixel).

## Reproduce

```bash
# Q style, about 35 minutes per lighting on 4 cores (one full frame per decoration).
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/decor/q-day --only decor
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/decor/q-night --only decor --lighting night
# Pixel, a few minutes per lighting.
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/decor/pixel --only decor
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/decor/pixel --only decor --lighting night

# Day first, then night: the night pass also rewrites DECOR_DEFINITIONS.
/tmp/bpyenv/bin/python art-pipeline/ps250-decor/process_decor.py /tmp/decor/q-day /tmp/decor/pixel --write-runtime
/tmp/bpyenv/bin/python art-pipeline/ps250-decor/process_decor.py /tmp/decor/q-night /tmp/decor/pixel --lighting night --write-runtime
```

## Design decisions

- **One sprite per decoration.** A decoration is rendered alone, with the furniture it stands on as a shadow catcher (so its contact shadow lands on the shelf or desk) and every other prop hidden. The room and prop renders hide every decoration, so they are unchanged and every decoration can be switched off.
- **Trimmed like a prop.** `process_pack.trim_prop` (solid core, shadow margin, sampling noise dropped); the trim box gives the placement, and a night decoration has its own box because its shadows fall another way. The pixel sprite is cut to the Q-style box, so both styles share the placements.
- **Draw order.** Only the furniture a decoration stands on overlaps it, so each is drawn just above its support: the shelf items at 23 (shelf 22), the desk items at 25 (desk 24), the floor lamp at 21 and the beanbag at 31 (in front of the chair, 30; below the characters, 40 and 42).
- **It moves with its support.** A placement override of the shelf or desk moves the decorations on it by the same offset. V2 does not apply overrides today (PS-246); this keeps the two together if it ever does.
- **The floor lamp lights nothing else.** Its shade glows at night, but a light in the shared room render would change the room whether or not the lamp is shown.
- **Hidden, not shown.** The device stores the decorations switched off (`world.hiddenDecorations`), so every decoration is shown by default, and one added later appears without a choice.
- **Precached.** The default room's decorations (Q style, by day and by night) are in `sw.js` SHELL, under the approved PS-250 rule that only the defaults are precached. The pixel ones are downloaded the first time they are shown.
- **Room styles next.** PS-250F1 covers the default room only; the other four room styles show no decorations until PS-250F2 renders them.
