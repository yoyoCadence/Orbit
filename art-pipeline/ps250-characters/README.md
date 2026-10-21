# PS-250C Q-style characters

This is the procedural Blender source for the Q-style protagonists and AI Companion forms of the "全 Q 版" set (PS-250). It contains:

- **Protagonists:** six outfits, each in every runtime pose and both facings (6 × 6 × 2 = 72 sprites).
- **Companions:** six forms, each in every Companion state (6 × 6 = 36 sprites).

The user approved this look from the prototype preview on 2026-10-21.

Everything is generated from code. There are no external models, textures or HDRIs, and no generated images feed in. Materials, outlines and the camera angle come from the PS-244 room (`../ps244-blender/scene.py`), so the characters belong to the same diorama.

Since PS-250B the Q style is the default:

- The office worker and Orbit are the default characters, and only their sprites are precached.
- The other characters can be chosen in Edit Mode. Each is downloaded the first time it is drawn.
- Offline, a chosen character that was never downloaded is drawn as the default.

## Files

| File | Role |
|---|---|
| `catalog.py` | Ids, labels, poses, facings, states and runtime paths. `pwa/js/personalSpace/v2/content/characterCatalog.js` mirrors it. |
| `rig.py` | Primitives (capsule, sphere, rounded box, tube, joint empties), the shared look and the two orthographic sprite cameras. |
| `protagonists.py` | The protagonist rig: legs, torso, head with face and hair, arms. It also holds the six outfits (`PROTAGONISTS`) and six poses (`POSES`), each pose a dict of joint rotations plus a face and mouth. |
| `companions.py` | The six Companion forms. They share one state language: eyes and tilt carry the expression, plus a glowing mark per state (sparks, `!`, sleep Zs, a work hologram). |
| `render_characters.py` | Renders every sprite as a full-canvas PNG with a transparent film. |
| `process_characters.py` | Checks for clipping, adds the protagonist contact shadow, encodes WebP, writes `outputs.json` and the previews. |
| `outputs.json` | Ids, labels, canvas sizes, encoding, and the size and SHA-256 of every runtime file. `tests/unit/ps250cCharacterCatalog.test.js` checks the catalog and the files against it. |
| `model-manifest.json` | Generator, version, license and processing provenance. |
| `previews/` | Contact sheets of every pose and state, and the default pair in the phase-100 room at the runtime placements. |

## Reproduce

```bash
# The same environment as ps244-blender (Python 3.13; bpy is Blender as a
# Python module).
python3 -m venv /tmp/bpyenv
/tmp/bpyenv/bin/pip install bpy==5.2.2 pillow==12.3.0 numpy==2.5.3

/tmp/bpyenv/bin/python art-pipeline/ps250-characters/render_characters.py /tmp/ps250-renders --samples 64
/tmp/bpyenv/bin/python art-pipeline/ps250-characters/process_characters.py /tmp/ps250-renders --write-runtime
npm run ps243:assets
```

The full set takes about 15 minutes on a 4-core CPU: about 10 s per protagonist and 3 s per Companion. For a subset, use `--protagonists`, `--poses`, `--companions` and `--states` (comma-separated), or `--skip-protagonists` / `--skip-companions`.

The renders themselves are not committed. To change some sprites without re-rendering the whole set:

1. Render only the changed sprites into an empty directory. Example: `--poses walk --skip-companions`.
2. Run `process_characters.py <dir> --write-runtime --reuse-committed`. A sprite with no render in the directory keeps its committed WebP and its hash from disk. Only the rendered sprites are re-encoded, and `outputs.json` is rebuilt to match.

Cycles reruns are not byte-identical, so render only what changed. WebP encoding of the same render is deterministic.

`process_characters.py` always writes the previews, by default into the committed `previews/` folder. For a check-only run, pass `--preview-dir` with another directory.

## Design decisions

- **Canvas and anchor.** The runtime places each sprite by its width and anchor, so the new sprites use the same anchors as the PS-242 pixel sprites and need no placement change:
  - **Protagonist:** drawn at 24% of the frame. That is about 369 px of the 1536 px room, so the 512 × 512 canvas has about 1.4× the room's texel density (the asset pipeline asks for 2× the runtime size). The ground point is at 241/256 of the canvas height, centred, where the pixel sprites put the feet, under the centre-bottom anchor.
  - **Companion:** drawn centred at 13% of the frame (about 200 px of the room), on a 256 × 256 canvas centred on its body.
- **One camera per kind.** Each kind uses an orthographic camera along the canonical room camera's direction. Every pose, outfit and state shares it. Scale, ground point and viewing angle are therefore identical across the set, and a jump (celebrate) really leaves the ground.
- **Light.** The sun is the room's warm window light from the right, and the fill is the room's cool front fill. In the room, the sun comes from behind the characters. Here it is turned toward the camera, otherwise every face would be in shadow.
- **Facings.** Each facing is a separate 28° turn. A mirrored image would put the window light on the wrong side.
- **Outline.** The room's Freestyle outline is 1.25 px at 1536. Characters use about 1.5 room pixels, converted to canvas pixels by how large each canvas is drawn: 2.13 px on the protagonist canvas and 1.97 px on the Companion canvas.
- **Walk.** The spread legs shorten the stance, so the walk pose drops the hips 2.5 cm and both feet stay on the floor. The foot nearer the camera sits lower in the image, so the lowest pixel of a right-facing walk is a few pixels below the ground point.
- **Contact shadow.** A soft, navy-tinted ellipse sits on the ground point under each protagonist and stays on the ground when the figure jumps. Companions float, so they have none, like the pixel Orbit.
- **Encoding.** Sprites are lossy WebP (quality 90) with a lossless alpha plane. At 2× zoom it cannot be told apart from the PNG, at about a tenth of the size: roughly 17 KB per protagonist and 7 KB per Companion (1.47 MB for all 108). A 256-colour palette PNG was smaller still but banded on the shading.
- **Proportions.** The Q style is about 1:2.5 head-to-body, more chibi than the art bible's 1:4.5–1:5, because the user asked for it. The height still matches the art bible's 25–32% of the scene. See art bible §6.1 and §9.1.

## Not in scope

- The pixel versions of these characters, the room and the furniture are PS-250D.
- No 3D runtime. The app still draws 2D sprites; the JS added is the catalog module and the Edit Mode picker (PS-250B).
