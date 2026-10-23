# PS-250E room styles

The room styles the user chose on 2026-10-21, each in the Q style and in pixels, by day and by night:

| id | Name | Look |
|---|---|---|
| `default` | 藍色工作室 | The PS-244 room (navy walls, brass, walnut). Its files stay where PS-244, PS-250D and PS-250E1 put them. |
| `nordic` | 明亮北歐 | Warm white walls, a sage wainscot, light oak and ash, black metal. |
| `washitsu` | 日式和風 | Plaster and shoji white, wood frames, a tatami-coloured floor, indigo cloth. |
| `nightowl` | 夜貓工作室 | Deep navy, cyan neon on the rails and crown, magenta accents. |
| `study` | 深木書房 | Ink green, dark wood, gold trim, a burgundy rug. The palette was kept for Mastery in the art bible; the user chose to offer it now. |

Each style is the PS-244 scene with other materials: the same geometry, camera, furniture shapes and lights. The style table is `art-pipeline/ps244-blender/room_styles.py`. A style can change the colour, roughness, metal and gloss of the plain toon materials in `scene.build_materials()`, or make one glow; it also sets the floor planks, the outline colour, the daylight ambient colour, the backdrop behind the cut-away room and the shadow handling below. The cork board, screens, books, lamp bulb and (at night) the glowing sconce shades are the same in every style, and the night lighting is shared by every style.

## Files

| File | Role |
|---|---|
| `rooms.py` | Runtime paths of a style's files and the `outputs.json` record, used by `ps244-blender/process_pack.py` and `ps250-pixel/process_pixel.py` |
| `outputs.json` | Size and SHA-256 of every style file, and how many visible pixels the cut to the shared boxes dropped. `tests/unit/ps250e2RoomStyles.test.js` checks the files against it |
| `thumbnails.py` | PS-250G: the Edit Mode picker's 216 x 144 WebP thumbnail of each room's day background, in both styles (`workspace/[pixel/]thumbnails/<room>.webp`); run it again after re-rendering a room |
| `thumbnails.json` | Size and SHA-256 of the thumbnails; `tests/unit/ps250gPickerThumbnails.test.js` checks them |
| `previews/` | `<style>[-night]-phase-*.jpg` (Q style, every project phase, with the default pair and the photo frame) and `<style>[-night]-pixel-phase-100.png` |

Runtime files: `pwa/assets/personal-space/v2/workspace/styles/<style>/` (Q style: `background[-night].webp`, `props/<id>[-night].png`) and `pwa/assets/personal-space/v2/workspace/pixel/styles/<style>/` (pixel, all PNG).

## Reproduce

```bash
# Q style, one lighting at a time (about 30 minutes each on 4 cores).
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/rooms/nordic-day --style nordic
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/process_pack.py /tmp/rooms/nordic-day --write-runtime --style nordic
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/rooms/nordic-night --style nordic --lighting night
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/process_pack.py /tmp/rooms/nordic-night --write-runtime --style nordic --lighting night

# Pixel (about 3 minutes each).
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/rooms/pixel --style nordic
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/process_pixel.py /tmp/rooms/pixel --write-runtime --style nordic
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/rooms/pixel --style nordic --lighting night
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/process_pixel.py /tmp/rooms/pixel --write-runtime --style nordic --lighting night
```

## Design decisions

- **Shared placements.** The lights and shapes are the same in every style, so a style's prop casts the same shadow as the default one. Each style prop is therefore cut to the default prop's trim box of the same lighting (from `ps244-blender/placements.json`), and every style uses the same `PROP_DEFINITIONS`. A style's own trim can differ by a few pixels (sampling noise, an outline in another colour); `outputs.json` → `clipped` counts, for each Q-style prop, the visible pixels the cut dropped, and a test keeps them small. The pixel props are cropped to the same boxes by construction (`process_pixel.process_prop`), so they have no count.
- **Not precached.** Like the pixel style (PS-250B), a room style is downloaded the first time it is shown. Offline, an image that was never downloaded is drawn from the default room.
- **Stored in `world.selectedThemeId`.** The field already existed, older versions keep it, and nothing read it before. Unknown values, including legacy theme ids such as `night`, are the default room.
- **No shadow wash at the shared boxes.** In a light room every prop darkens a wide area around it a little (alpha 30–55): the bright daylight ambient, and at night the lamp light bounced off pale walls. In the navy room that stays under the trim's noise floor; on a pale floor it showed as grey rectangles where the shared box cuts it. Light styles set `shadow_floor`: below it, alpha is dropped, and from it up to the solid threshold it is rescaled continuously, so contact shadows keep their shape; solid geometry and its anti-aliased edge (2 px) are left alone. Almost nothing then reaches past the shared box (Nordic: 56, at most 21 faint pixels next to a prop's edge; without it, 135,000 pixels were cut at night). Every non-default style sets it: the dark styles a lower floor (40), because the wash is barely visible on a dark floor but a cut edge still is (夜貓工作室 cut 28,000 pixels at night without it, at most 107 with it).
- **Softer pixel shadows on light floors.** The default pixel props use a navy shadow at two strong opacities, which reads as hard dark blocks on a pale floor. Light styles set a warm grey at three lower opacities (`pixel_shadow`).
- **A dark backdrop at night.** A light style's pale backdrop looks wrong around the night room, so it sets `backdrop_night`.
- **One window view for every style (PS-251B).** A style keeps the window and what it shows, so the morning and evening overlays from `art-pipeline/ps251-window/` serve every room. A new style needs no overlay of its own unless it changes the window, the camera or the skyline.
- **The fallback is the default Q-style room.** Offline, a room style that was never downloaded is drawn as the default room of the Q style, which is precached, also in the pixel style; the characters stay as chosen (the same as for the pixel room since PS-250D).
