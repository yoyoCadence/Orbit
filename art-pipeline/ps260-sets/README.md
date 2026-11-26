# PS-260 themed character sets

Ten themed sets, five male and five female (user request, 2026-11-25). Each
set is a protagonist, a room style and two decorations designed together. The
proposal and the segment plan are in
[`docs/ps-260-character-sets-proposal.md`](../../docs/ps-260-character-sets-proposal.md).

| Set | Gender | Protagonist | Room | Decorations |
|-----|--------|-------------|------|-------------|
| `astronaut` | male | 太空人: white suit, orange knee pads, life-support pack, chest panel, headset antenna | `spacestation` 太空站 | `deco-rocket` 火箭模型, `deco-planet` 行星燈 |
| `samurai` | male | 武士: white kimono with crossed collar, red obi, navy hakama, topknot, wooden sword | `dojo` 劍道場 | `deco-katana` 刀架, `deco-bonsai` 盆景 |
| `detective` | male | 偵探: tan trench coat with belt, red scarf, fedora, magnifying glass | `noir` 偵探事務所 | `deco-typewriter` 打字機, `deco-hatstand` 衣帽架 |
| `chef` | male | 主廚: double-breasted white jacket, red neckerchief, waist apron, toque, whisk | `bistro` 法式廚房 | `deco-cake` 蛋糕架, `deco-bread` 麵包籃 |
| `explorer` | male | 探險家: khaki shirt, olive vest, pith helmet, backpack with bedroll, boots | `jungle` 叢林營地 | `deco-fern` 蕨類盆栽, `deco-lantern` 探險油燈 |
| `witch` | female | 魔法師: purple robe, gold sash, pointed hat, wand with a glowing star | `wizard` 魔法塔 | `deco-crystal` 水晶球, `deco-potions` 魔藥瓶 |
| `idol` | female | 偶像: pink tiered dress, twin tails with ribbons, headset mic, white boots | `stage` 偶像練習室 | `deco-mic` 麥克風架, `deco-heartlamp` 愛心燈 |
| `gardener` | female | 園藝師: denim pinafore, braids, straw hat, green boots, trowel | `greenhouse` 溫室花房 | `deco-flowerpot` 花盆, `deco-wateringcan` 澆花壺 |
| `hacker` | female | 駭客: black techwear with glowing seams and soles, bob with a neon streak, goggles | `cyber` 賽博空間 | `deco-server` 伺服器機櫃, `deco-hologram` 全像投影 |
| `marine` | female | 海洋學家: teal wetsuit with yellow stripes, dive mask and snorkel, shell necklace | `ocean` 海底研究站 | `deco-aquarium` 水族箱, `deco-coral` 珊瑚燈 |

![line-up](previews/lineup.jpg)

## Files

| File | Purpose |
|------|---------|
| `sets_catalog.py` | The ten sets (ids, labels, gender, room, decorations), poses, facings and runtime paths. Pure Python. |
| `characters.py` | The costumes: builds the PS-250C body (`ps250-characters/protagonists.py`, unchanged) and adds each set's pieces to its joints. |
| `render_sets.py` | Renders every protagonist sprite with the PS-250C camera, lights, outline and facings. |
| `process_sets.py` | Clip check, contact shadow, WebP, `outputs.json` and the previews, with the PS-250C helpers. |
| `outputs.json` | Ids, labels, gender, the set → room → decorations map, and the size and SHA-256 of every sprite. `tests/unit/ps260aCharacterSets.test.js` checks the files against it. |
| `process_pixel_sets.py` | PS-260D: the pixel protagonists, made from the committed sprites with the PS-250D reduction (`ps250-pixel/process_pixel.process_character`); writes `pixel-outputs.json`. |
| `pixel-outputs.json` | Size and SHA-256 of every pixel protagonist. `tests/unit/ps260dPixelProtagonists.test.js` checks the files against it. |
| `rooms-outputs.json` | PS-260B: size and SHA-256 of every room file (Q style and pixel, by day and by night) and how many visible pixels the cut of each Q-style prop dropped. Written by `ps244-blender/process_pack.py` and `ps250-pixel/process_pixel.py` for a PS-260 room; `tests/unit/ps260bRoomStyles.test.js` checks it. |
| `previews/` | `protagonists.jpg` (every pose and facing) and `lineup.jpg`; `pixel-protagonists.png` and `pixel-lineup.png` for the pixel versions; `rooms/` has each room in every project phase, by day and by night, and in pixels. |

## How the costumes are built

- The body, face, hair styles, poses and facings are the PS-250C rig, so the
  sets stand, walk and celebrate exactly like the six PS-250C protagonists and
  the runtime draws them with the same placements.
- Every costume piece is parented to a rig joint (`neck` for hats and hair,
  `chest` for collars, packs and panels, `hips` for skirts and robes,
  `ankle_*` for boots, `elbow_*` for what the hand holds), so it follows every
  pose.
- Hats hang from one empty (`hat_root`) that carries the tilt, sit lower than
  the hair cap and are wider than it, as a real hat sits on the head. The
  canvas leaves about 0.1 m above the hair: the tallest hats (witch, toque)
  keep 7–8 px of headroom in `celebrate`, and `process_sets.py` fails any
  sprite that touches the canvas edge.
- `'outfit': 'plain'` is a torso without the PS-250C outfit details, for sets
  that bring their own front (a `tee` print showed through the witch's
  brooch).
- The female sets add eyelashes; glowing parts (the hacker's seams, the
  witch's wand) use an emission material like the room's neon.

## Reproduce

Blender's Python module (`pip install bpy`, Blender 5.2) and Pillow + numpy.

```bash
/tmp/bpyenv/bin/python art-pipeline/ps260-sets/render_sets.py /tmp/ps260-renders --samples 64
python3 art-pipeline/ps260-sets/process_sets.py /tmp/ps260-renders --write-runtime
```

About 8 s per sprite on a 4-core CPU (120 sprites, ~16 min). To change one set,
render only it (`--protagonists witch`), then run `process_sets.py
--write-runtime --reuse-committed`: sprites without a render keep their
committed WebP and hash. For a check-only run, pass `--preview-dir` with another
directory and leave out `--write-runtime`.

The pixel versions need no render: after changing the Q-style sprites, run

```bash
python3 art-pipeline/ps260-sets/process_pixel_sets.py --write-runtime
```

It always writes the previews, by default into the committed `previews/`; for
a check-only run pass `--preview-dir` with another directory and leave out
`--write-runtime`. `pixel-outputs.json` records the Q-style sprite each pixel
one was made from, so a re-render without this step fails the tests.

## Rooms (PS-260B)

Each set's room is a style in `ps244-blender/room_styles.py` (`PS260_STYLES`):
the PS-244 room, camera, furniture and lights with the set's materials, like
the PS-250E styles. Two things are new:

- **Its own view out of the window.** A style can name an `exterior`
  (`scene.build_exterior`): a starfield with a planet or moon (space station,
  wizard tower), bamboo (dojo), jungle, a garden (greenhouse) or kelp and
  bubbles (ocean), or PS-244's city (the same towers) in the room's own
  colours (a grey-blue dusk, warm tones, pastels, a dark smog with neon
  windows). The
  plants and dots are placed along camera rays through the window, inside its
  edges and under the sightline over the right wall, like the PS-244 towers;
  a `ground` wedge cut to the window's ray fan fills what the towers used to
  cover (the camera sees that ground only through the window). PS-244's city
  path is unchanged, so the default and PS-250E rooms render as before.
- **Props rendered only where they are kept.** Every style prop is cut to the
  default prop's box anyway, so `render_pack.py --prop-boxes` renders each
  prop only inside that box plus 48 px (like `--decor-boxes` for the PS-250F2
  decorations): about 10 minutes per lighting instead of 30. The cut count
  (`clipped`) then sees only the rendered ring, so `process_pack.py` fails a
  prop that runs onto the ring's outer edge (an edge on the frame's own border
  does not count); render that prop again without `--prop-boxes`. In B1 the
  office shelf did so in the dojo by day and night, the bistro at night and
  the space station at night, and those four use full-frame shelves. The
  dojo's light plaster caught a wide faint wash from the shelf by day (617
  pixels past the box), so the dojo's `shadow_floor` is 72 instead of 56.

The PS-260 rooms are recorded in `rooms-outputs.json` and previewed in
`previews/rooms/` (`b1-overview.jpg` and `b2-overview.jpg`, each half's five rooms side by
side, are contact sheets of their `*-phase-100.jpg` for the PRs), not in `ps250-rooms/`,
so that record keeps exactly the
rooms the picker lists until PS-260E adds these. The picker thumbnails
(`ps250-rooms/thumbnails.py`) are made in PS-260E too.

```bash
P=art-pipeline/ps244-blender/placements.json
for style in spacestation dojo noir bistro jungle wizard stage greenhouse cyber ocean; do
  for lighting in day night; do
    /tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/rooms/$style-$lighting \
      --style $style --lighting $lighting --prop-boxes $P
    /tmp/bpyenv/bin/python art-pipeline/ps244-blender/process_pack.py /tmp/rooms/$style-$lighting \
      --write-runtime --style $style --lighting $lighting
    /tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/rooms/pixel --style $style --lighting $lighting
    /tmp/bpyenv/bin/python art-pipeline/ps250-pixel/process_pixel.py /tmp/rooms/pixel \
      --write-runtime --style $style --lighting $lighting
  done
done
```

## Decorations (PS-260C)

Each set's room shows the six PS-250F decorations in its own materials (cut
to the default boxes, like PS-250F2) and the set's two decorations
(`ps244-blender/decor_sets.py`), which stand only in that room:

| Spot | Where | Sets' pieces |
|------|-------|--------------|
| back wall (z 23) | the floor against the back wall between the desk and the shelf, under the photo frame (at most about 1.45 m tall) | rocket, sword rack, hat stand with coat and fedora, cake table, fern, potion cabinet, microphone stand, sunflower planter, server rack, aquarium |
| front right (z 32) | the free floor by the window, in front of the plant, below the characters | planet lamp, bonsai table, typewriter on a side table, bread crate, lantern on a crate, crystal ball, heart lamp, watering can and pots, hologram projector, coral lamp |

Each decoration's spot is `sets_catalog.DECOR_SPOTS`, and its draw order
follows the spot (`DECOR_Z`), not the order the catalog lists a set's two.
Lamps, screens, potions and corals glow through emission only (like the
PS-250F floor lamp), so the shared room render is unchanged. A set decoration
has no default box: it is trimmed like a prop in its own room, and its box
gives its placement (`decor-placements.json`, by room, decoration and
lighting); the pixel sprite is cut to the same box.

| File | Purpose |
|------|---------|
| `process_decor_sets.py` | The set's two decorations: trim, placements, both styles, records, and a preview of the whole set in its room (`previews/sets/`). |
| `decor-placements.json` | Placement (x, y, width in % of the frame; z) and trim box of each set decoration, by day and by night. |
| `decor-outputs.json` | Size and SHA-256 of every decoration file of the PS-260 rooms (the six PS-250F ones too, written by `ps250-decor/process_decor.py --style`), and how many pixels the cut of each PS-250F one dropped. `tests/unit/ps260cDecorations.test.js` checks both files. |

```bash
B=art-pipeline/ps250-decor/placements.json
for style in spacestation dojo noir bistro jungle wizard stage greenhouse cyber ocean; do
  own=$(cd art-pipeline/ps260-sets && python3 -c "import sets_catalog as c; print(','.join(d for s in c.SETS if s['room'][0] == '$style' for d, _ in s['decor']))")
  for lighting in day night; do
    /tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/decor/$style-$lighting \
      --only decor,$own --style $style --lighting $lighting --decor-boxes $B
    /tmp/bpyenv/bin/python art-pipeline/ps250-pixel/render_pixel.py /tmp/decor/pixel \
      --only decor,$own --style $style --lighting $lighting --decor-boxes $B
    /tmp/bpyenv/bin/python art-pipeline/ps250-decor/process_decor.py /tmp/decor/$style-$lighting /tmp/decor/pixel \
      --style $style --lighting $lighting --write-runtime
    /tmp/bpyenv/bin/python art-pipeline/ps260-sets/process_decor_sets.py /tmp/decor/$style-$lighting /tmp/decor/pixel \
      --style $style --lighting $lighting --write-runtime
  done
done
```

The six PS-250F decorations render inside their default boxes (about 5
minutes per lighting); the set's two render in full frame, since they have no
box yet (about 3 minutes each).

The cut of a PS-250F decoration in a PS-260 room drops at most 908 pixels: the
cyber room's floor lamp at night, whose pole shadow falls on the near-black
wall past the box where it cannot be seen (the PS-250F2 night-owl lamp drops
729 the same way). The pale rooms' beanbag casts a long faint shadow at
night: 757 in the bistro; the greenhouse's was 1092, so its `shadow_floor` is
72 (as the dojo's), which brought it to 454 and re-processed its room props
from the same renders. The test's limit is 1000. `previews/sets/` shows
each whole set: the room, its props and decorations, the set's protagonist
and Orbit (`c1-overview.jpg` and `c2-overview.jpg`: the male and the female
sets side by side).
