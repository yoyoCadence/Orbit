# PS-251B window view by time of day

The view outside the window in the morning (05:00–10:00) and the evening (17:00–21:00), in the Q style and in pixels. The user chose this on 2026-10-23 (proposal: [`docs/ps-251b-window-view-proposal.md`](../../docs/ps-251b-window-view-proposal.md), §8: S1, W2, T1) and approved the preview colours before the runtime files were made.

- **What changes.** The window shows the towers almost only (the sky is about 0.1% of it), so the skyline keeps its shape and the band is carried by the tower colours and the lit windows (S1). Morning: peach and lilac towers, a pale warm far side, few lit windows. Evening: purple towers, a far side warmed by the sunset, many lit windows. The values are `BANDS` in `render_window.py`.
- **What stays.** By day and at night the view baked into the room render shows (W2). The room's own light does not change: the runtime light layer of the room drawn (the day room in the morning, the night room in the evening) tints the overlay with everything else.

## Files

| File | Role |
|---|---|
| `render_window.py` | Renders one band, Q style (1536 × 1024) or `--pixel` (384 × 256, the PS-250D settings): the PS-244 scene with the band's sky and skyline, props and decorations hidden, every other object a holdout, transparent film |
| `process_window.py` | Checks each render is opaque only inside the window; writes the runtime files and `outputs.json` |
| `preview_window.py` | Composites every room style × art style × band, now and after (room, overlay, the finished project's furniture, the runtime light layer) |
| `outputs.json` | Size and SHA-256 of the four runtime files; `tests/unit/ps251bWindowView.test.js` checks the files against it |
| `previews/` | `window-q.jpg`, `window-pixel.jpg` (window crops of the five rooms, now and after) and `default-{q,pixel}-{morning,evening}.jpg` (the default room's full frame), the previews the user approved |

Runtime files: `pwa/assets/personal-space/v2/workspace/window/exterior-{morning,evening}.webp` (Q style: lossy WebP with alpha, quality 86) and `pwa/assets/personal-space/v2/workspace/pixel/window/exterior-{morning,evening}.png` (pixel: 32 colours, hard alpha, every art pixel 4 × 4). About 12–13 KB each.

## Reproduce

```bash
# The PS-244 environment (bpy, Pillow, NumPy; see ps244-blender/README.md).
for band in morning evening; do
  /tmp/bpyenv/bin/python art-pipeline/ps251-window/render_window.py /tmp/ps251-window --band $band
  /tmp/bpyenv/bin/python art-pipeline/ps251-window/render_window.py /tmp/ps251-window --band $band --pixel
done
/tmp/bpyenv/bin/python art-pipeline/ps251-window/process_window.py /tmp/ps251-window --write-runtime
/tmp/bpyenv/bin/python art-pipeline/ps251-window/preview_window.py /tmp/ps251-window art-pipeline/ps251-window/previews
npm run ps242:manifest && npm run ps243:assets
```

Each render takes about a minute on a 4-core CPU: only the window lights anything. `--style <room>` renders with another room style's materials, only to check that the overlay is the same for every room (the default is what ships).

## Design decisions

- **One overlay per art style, for every room.** The five room styles change materials, never the geometry, the camera or the window (PS-250E2), so the window area is the same. Checked by rendering the overlay with the Japanese and night-owl styles: the alpha differs from the default in 3 edge pixels by 8/255.
- **The object holdout flag, not the Holdout material.** Every room object gets `is_holdout`, so only what the window shows is opaque. The Holdout material that `render_pack.set_occluder()` uses for PS-247 would let Freestyle draw the room's outlines into the image; here outlines are off and the object flag leaves nothing behind. The window frame, the blinds and the curtain stay from the room background, over which the overlay is drawn below them only where the glass is.
- **Above the room, below the furniture.** The overlay covers the baked-in view; every prop and decoration has a higher draw order (Pixi `zIndex` 1; on the poster an image right after the background without a z-index). The art bible §7 layer order (room shell → exterior → props) is kept.
- **The overlay follows the room drawn.** When the pixel room or a room style cannot load and the Q-style default room is drawn, the Q-style overlay is drawn with it; when the night room cannot load in the evening and the day room is drawn, the evening overlay stays. An overlay that cannot load is left out, and the baked-in view shows.
- **Pixel alpha is hard and the transparent area is black.** Colour under zero alpha is cleared before the colours are reduced, so the palette is spent on the view (the PNG went from 51 KB to 13 KB).
- **Cache.** The Q-style overlays are in the PS-242 manifest and precached by the service worker; the pixel ones are downloaded the first time they are shown, like the pixel room (PS-250B).
