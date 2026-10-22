# Personal Space V2 production assets

This folder contains only reviewed runtime outputs for the Building Formal Workstation vertical slice. Sources and processing live in:

- `art-pipeline/ps242/`: the pixel characters and the weather.
- `art-pipeline/ps244-blender/`: the room and the furniture.
- `art-pipeline/ps250-characters/`: the Q-style characters under `characters/toon/`. These have been the default characters since PS-250B.
- `art-pipeline/ps250-pixel/`: the pixel style (PS-250D) under `workspace/pixel/` and `characters/pixel/`. The PS-242 characters under `characters/protagonist/` and `characters/companion/` are extra options in that style.
- `art-pipeline/ps250-rooms/`: the room styles (PS-250E2) under `workspace/styles/<style>/` and `workspace/pixel/styles/<style>/`, and the Edit Mode picker's room thumbnails (PS-250G) under `workspace/thumbnails/` and `workspace/pixel/thumbnails/`.
- `art-pipeline/ps250-decor/`: the decorations (PS-250F) under `workspace/decor/` and `workspace/pixel/decor/`, a room style's under `styles/<style>/` in each.

## Runtime contract

- Canonical scene: 3:2 at 960×640 logical pixels; authored background is 1536×1024.
- Protagonist: `idle`, `work`, `celebrate`, `rest`, `walk`, and `inspect`, each with left/right facings.
- Companion: `observe`, `approach`, `congratulate`, `rest`, `work`, and `remind`; `idle` safely aliases to `observe`.
- Weather: `clear` uses sparse warm motes; `rain` uses sparse cool diagonal streaks.
- Day and night (PS-250E1): the room and props have a day render and a night render of the same scene and camera (`-night` files; the evening and the night use the night render). The code-native lighting overlay stays, weaker over the night room, for the characters and weather; the morning tint still comes from it over the day room.
- Project phases remain cumulative named prop layers; approved legacy prop paths are preserved.

`manifest.json` is generated from `pwa/js/personalSpace/v2/content/assetManifest.js` and is the production provenance/QC inventory. Do not hand-edit it; run `npm run ps242:manifest`.

## Budget

Measured by `npm run ps243:assets` (`docs/ps243/asset-baseline.json`, test-enforced) as of PS-250G:

- Initial background + default protagonist + Companion + clear weather: 122,433 bytes by day, 104,205 bytes in the evening and at night (PASS, target ≤ 1.5 MB).
- Complete default set, 50 files: the day and night rooms, 16 props, 12 decorations, the default characters and the weather: 1,409,958 bytes (PASS, target ≤ 4 MB).

The Pixi runtime loads only the active state bundle. The static DOM poster resolves the same files and remains the accessible/reduced-motion/WebGL-failure fallback.
