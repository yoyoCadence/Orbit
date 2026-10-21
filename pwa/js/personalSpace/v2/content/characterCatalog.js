/**
 * PS-250C: the Q-style characters rendered by art-pipeline/ps250-characters.
 *
 * Six protagonists in every runtime pose and facing, and six Companion forms
 * in every Companion state. The scene does not use them yet: PS-250B adds the
 * style and character choice. Until then only the developer asset gallery
 * lists them, and nothing precaches them.
 *
 * Mirrors catalog.py in the pipeline; tests/unit/ps250cCharacterCatalog.test.js
 * checks every path and label against its outputs.json.
 */
const TOON_ROOT = 'assets/personal-space/v2/characters/toon';

export const TOON_PROTAGONISTS = Object.freeze([
  Object.freeze({ id: 'office', label: '上班族' }),
  Object.freeze({ id: 'hoodie', label: '帽 T' }),
  Object.freeze({ id: 'sweater', label: '毛衣長髮' }),
  Object.freeze({ id: 'sporty', label: '運動馬尾' }),
  Object.freeze({ id: 'scientist', label: '科學家' }),
  Object.freeze({ id: 'artist', label: '畫家' }),
]);

export const TOON_COMPANIONS = Object.freeze([
  Object.freeze({ id: 'orbit', label: 'Orbit' }),
  Object.freeze({ id: 'catbot', label: '貓型機器人' }),
  Object.freeze({ id: 'owl', label: '貓頭鷹' }),
  Object.freeze({ id: 'cube', label: '方塊無人機' }),
  Object.freeze({ id: 'jelly', label: '果凍' }),
  Object.freeze({ id: 'fox', label: '狐狸' }),
]);

// The same states as PROTAGONIST_VARIANTS and COMPANION_VARIANTS in assetManifest.js.
export const TOON_PROTAGONIST_POSES = Object.freeze(['idle', 'work', 'celebrate', 'rest', 'walk', 'inspect']);
export const TOON_FACINGS = Object.freeze(['left', 'right']);
export const TOON_COMPANION_STATES = Object.freeze(['observe', 'approach', 'congratulate', 'rest', 'work', 'remind']);

export function toonProtagonistPath(id, pose, facing) {
  return `${TOON_ROOT}/protagonist/${id}-${pose}-${facing}.webp`;
}

export function toonCompanionPath(id, state) {
  return `${TOON_ROOT}/companion/${id}-${state}.webp`;
}

/** Every Q-style character sprite, protagonists first. */
export function getToonCharacterPaths() {
  return Object.freeze([
    ...TOON_PROTAGONISTS.flatMap(({ id }) => TOON_PROTAGONIST_POSES
      .flatMap(pose => TOON_FACINGS.map(facing => toonProtagonistPath(id, pose, facing)))),
    ...TOON_COMPANIONS.flatMap(({ id }) => TOON_COMPANION_STATES.map(state => toonCompanionPath(id, state))),
  ]);
}
