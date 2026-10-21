# Personal Space V2 production assets

This folder contains only reviewed runtime outputs for the Building Formal Workstation vertical slice. Sources and processing live in:

- `art-pipeline/ps242/`: the pixel characters and the weather.
- `art-pipeline/ps244-blender/`: the room and the furniture.
- `art-pipeline/ps250-characters/`: the Q-style characters under `characters/toon/`. These have been the default characters since PS-250B; the pixel characters are the pixel style.

## Runtime contract

- Canonical scene: 3:2 at 960×640 logical pixels; authored background is 1536×1024.
- Protagonist: `idle`, `work`, `celebrate`, `rest`, `walk`, and `inspect`, each with left/right facings.
- Companion: `observe`, `approach`, `congratulate`, `rest`, `work`, and `remind`; `idle` safely aliases to `observe`.
- Weather: `clear` uses sparse warm motes; `rain` uses sparse cool diagonal streaks.
- Day/night remains the existing code-native lighting overlay so geometry stays identical and the first-paint bundle remains small.
- Project phases remain cumulative named prop layers; approved legacy prop paths are preserved.

`manifest.json` is generated from `pwa/js/personalSpace/v2/content/assetManifest.js` and is the production provenance/QC inventory. Do not hand-edit it; run `npm run ps242:manifest`.

## Budget

- Initial background + default protagonist + Companion + clear weather: 259,133 bytes (PASS, target ≤ 1.5 MB).
- Full 29-file production state pack including eight project props: 1,766,935 bytes (PASS, target ≤ 4 MB).

The Pixi runtime loads only the active state bundle. The static DOM poster resolves the same files and remains the accessible/reduced-motion/WebGL-failure fallback.
