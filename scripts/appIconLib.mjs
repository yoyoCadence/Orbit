// UI-203: what scripts/make-icons.mjs and tests/e2e/ui203-app-icon.test.js
// share about the app icon source (art-pipeline/app-icon/icon.svg).

export const ICON_SOURCE = new URL('../art-pipeline/app-icon/icon.svg', import.meta.url);

/** The art shrinks to this in the maskable icon (Android cuts it to a shape). */
export const MASKABLE_SCALE = 0.8;

/** Android's maskable safe zone: a circle of this radius, as a share of the width. */
export const MASKABLE_SAFE_RADIUS = 0.4;

const ART_OPEN = '<g id="art">';
const BACKGROUND = /<rect width="1024" height="1024" fill="url\(#bg\)"\/>/;

function requireArt(svg) {
  if (!svg.includes('<g id="art"')) throw new Error('icon.svg needs a <g id="art"> group');
  if (!BACKGROUND.test(svg)) throw new Error('icon.svg needs its full-size background <rect fill="url(#bg)">');
}

/** The source with the art shrunk into the safe zone, background unchanged. */
export function maskableSvg(svg) {
  if (!svg.includes(ART_OPEN)) throw new Error('icon.svg needs a plain <g id="art"> group');
  requireArt(svg);
  const offset = (1024 * (1 - MASKABLE_SCALE)) / 2;
  return svg.replace(ART_OPEN, `<g id="art" transform="translate(${offset} ${offset}) scale(${MASKABLE_SCALE})">`);
}

/** The same SVG without its background, to measure where the art reaches. */
export function artOnlySvg(svg) {
  requireArt(svg);
  return svg.replace(BACKGROUND, '');
}
