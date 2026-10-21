# PS-250D pixel set

The "全像素" style (PS-250): a pixel version of the room, the eight Workspace Upgrade props and every PS-250C character (six protagonists in six poses and two facings, six Companion forms in six states). The PS-242 pixel characters stay in the pixel style as extra options ("經典像素主角", "經典 Orbit").

Everything comes from the committed sources: the PS-244 scene for the room and props, and the committed PS-250C sprites for the characters. There are no external images or models.

## Files

| File | Role |
|---|---|
| `render_pixel.py` | Renders the room and each prop at 384 × 256 (a quarter of 1536 × 1024) with `ps244-blender/render_pack.py`, so the room, shadow catchers and occluders are the same as the Q-style renders. Only the render settings change: almost no pixel filter (no anti-aliasing) and one-pixel outlines. |
| `process_pixel.py` | Quantizes the renders, builds the pixel characters from the PS-250C sprites, scales everything by 4 with nearest neighbour, writes the PNGs, `outputs.json` and the previews. |
| `outputs.json` | Paths, palette sizes, and the size and SHA-256 of every runtime file. `tests/unit/ps250dPixelSet.test.js` checks the scene, the files on disk and the hashes against it. |
| `model-manifest.json` | Generator, version, license and processing provenance. |
| `previews/` | Contact sheets of every pixel character, and the room at 0% and 100% with the props and the default pair at the runtime placements. |

## Reproduce

```bash
# The same environment as ps244-blender and ps250-characters.
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/ps250-pixel --samples 64
/tmp/bpyenv/bin/python art-pipeline/ps250-pixel/process_pixel.py /tmp/ps250-pixel --write-runtime
npm run ps243:assets
```

The room and props take about 3 minutes on a 4-core CPU; the characters need no render, so `process_pixel.py` reads `pwa/assets/personal-space/v2/characters/toon/`. Re-run it after the PS-250C sprites change. Previews are always written, by default into `previews/`; pass `--preview-dir` for a check-only run.

## Design decisions

- **One art pixel is four room pixels.** The room and props are rendered at a quarter of the frame and scaled by 4. The characters get the same pixel size: the protagonist is drawn about 369 room pixels wide, so it is reduced to 92 art pixels (a 368 px canvas); the Companion, about 200 wide, to 50 (200 px). The framing is the PS-250C one, so the anchors and runtime placements are unchanged.
- **The scene is rendered small, not reduced.** Reducing the 1536 px render gives a blurry, posterized room. Rendering at 384 px with no anti-aliasing gives hard pixel edges and one-pixel outlines.
- **The characters are reduced, not rendered small.** Rendering the rigs at 92 px lost the faces. Reducing the full-size sprites keeps the eyes, and the reduction adds a little contrast and sharpening and a one-pixel dark outline, as in the prototype the user approved.
- **One palette per image.** The room has 64 colours, each prop 32, protagonists 32 and Companions 24, no dithering. A shared palette lost the plant's green.
- **Props share the Q-style placement.** Each prop is cropped to its Q-style trim box (`ps244-blender/placements.json`, divided by 4 and rounded outward), scaled by 4, and cut to exactly that box. The pixel prop therefore has the same size as its Q-style twin and uses the same `PROP_DEFINITIONS` placement. Solid parts are opaque; shadows are one navy tone at two opacities, with isolated noise pixels dropped.
- **PNG.** Pixel art with flat colours compresses well losslessly; lossy WebP would blur the pixel edges. The whole set is about 636 KB.

## Not in scope

- The pixel style is not precached (PS-250B: only the default style is). Offline, a pixel image that was never downloaded is drawn from the Q style.
- New scenes and small furniture are PS-250E and PS-250F.
