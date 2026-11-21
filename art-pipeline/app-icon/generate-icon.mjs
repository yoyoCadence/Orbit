// UI-204: writes art-pipeline/app-icon/icon.svg — the "rising orbit" app icon.
//
//   node art-pipeline/app-icon/generate-icon.mjs      then   npm run icons
//
// The orbit is not a closed ring but a spiral that widens and brightens as it climbs:
// daily effort accumulating into a trajectory. The gold body at its end is the light
// source and lights the sphere from the upper right. SVG cannot vary a stroke's width or
// colour along its length, so the ribbon is sampled here into small opaque polygons that
// overlap by one sample (no seams); the back half is drawn before the sphere, the front
// half after it.
//
// Contract kept (scripts/appIconLib.mjs, tests/e2e/ui203-app-icon.test.js): the background
// is exactly <rect width="1024" height="1024" fill="url(#bg)"/>, everything else is inside
// <g id="art"> and stays within the inscribed circle (no full-tile layers), so the
// maskable icon's art stays inside Android's safe zone. Measured: reach 0.469 full bleed,
// 0.375 maskable. Change the constants below, rerun both commands, rerun that test.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./icon.svg', import.meta.url));

const S = [486.0, 584.0]; // sphere centre
const R_SPHERE = 158.0;
const TILT = (-24 * Math.PI) / 180; // orbit plane tilt (right side up)
const SQUASH = 0.4; // perspective squash of the orbit plane
const TH0 = -1.5 * Math.PI; // 1.75 turns: two front passes show the spiral
const TH1 = 2 * Math.PI;
const R0 = 196.0; // spiral radius at start / end
const R1 = 380.0;
const W0 = 7.0; // ribbon width at start / end
const W1 = 56.0;
const N = 360;
const MOON_R = 54;

const STOPS = [ // trail colour along the spiral, 0 = start, 1 = the gold body
  [0.0, [78, 40, 170]],
  [0.3, [124, 84, 226]],
  [0.55, [186, 150, 255]],
  [0.84, [236, 210, 255]],
  [0.92, [255, 214, 138]],
  [1.0, [255, 196, 84]],
];

const lerp = (a, b, t) => a + (b - a) * t;
// Round half to even, so the output is byte-identical to the reviewed design.
const roundEven = (x) => {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
};
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const fmt = (v) => v.toFixed(1);

const ease = (t) => t * t * (3 - 2 * t) * 0.35 + t * 0.65; // mostly linear, slightly eased

function point(th) {
  const t = (th - TH0) / (TH1 - TH0);
  const r = R0 + (R1 - R0) * ease(t);
  const x = r * Math.cos(th);
  const y = r * Math.sin(th) * SQUASH;
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  return { p: [S[0] + x * ct - y * st, S[1] + x * st + y * ct], t };
}

function trailColour(t) {
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (t <= t1) return c0.map((a, k) => roundEven(lerp(a, c1[k], (t - t0) / (t1 - t0))));
  }
  return STOPS[STOPS.length - 1][1];
}

const width = (t) => lerp(W0, W1, t ** 1.15);

const samples = [];
for (let i = 0; i <= N; i += 1) {
  const th = lerp(TH0, TH1, i / N);
  const { p, t } = point(th);
  samples.push({ th, p, t });
}

function normal(i) {
  const a = samples[Math.max(0, i - 1)].p;
  const b = samples[Math.min(N, i + 1)].p;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

// The lower half of the orbit plane (sin > 0) is nearer the viewer.
const isFront = (th) => Math.sin(th) > 0;

function segmentPolys(front) {
  const out = [];
  const step = 2;
  for (let i = 0; i < N; i += step) {
    const j = Math.min(N, i + step + 1); // +1 overlap hides seams
    const mid = samples[Math.floor((i + j) / 2)];
    if (isFront(mid.th) !== front) continue;
    const left = [];
    const right = [];
    for (let k = i; k <= j; k += 1) {
      const { p, t } = samples[k];
      const n = normal(k);
      const w = width(t) / 2;
      left.push([p[0] + n[0] * w, p[1] + n[1] * w]);
      right.push([p[0] - n[0] * w, p[1] - n[1] * w]);
    }
    const pts = left.concat(right.reverse());
    const d = 'M' + pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L') + 'Z';
    out.push([d, hex(trailColour(mid.t)), (1).toFixed(3)]);
  }
  return out;
}

function centerline(tFrom, tTo, front = null) {
  const pts = samples.filter(({ th, t }) => t >= tFrom && t <= tTo && (front === null || isFront(th) === front)).map((s) => s.p);
  return 'M' + pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L');
}

const back = segmentPolys(false);
const frontPolys = segmentPolys(true);
const end = samples[samples.length - 1].p;
const frontCenter = centerline(0.0, 1.0, true);
const frontT = samples.filter(({ th }) => isFront(th)).map((s) => s.t);
const frontW = width(frontT.reduce((a, b) => a + b, 0) / frontT.length);
const core = centerline(0.76, 1.0);
const [ex, ey] = end;

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
  '  <!-- UI-204: Orbit app icon. A spiral orbit that widens and brightens as it climbs —',
  '       daily effort accumulating into a trajectory. The gold body at its end is the light',
  '       source and lights the sphere from the upper right. Full-bleed square (iOS and',
  '       Android add their own mask). Generated by art-pipeline/app-icon/generate-icon.mjs;',
  '       `npm run icons` (scripts/make-icons.mjs) renders pwa/assets/*icon*.png from it. -->',
  '  <defs>',
  '    <radialGradient id="bg" cx="72%" cy="26%" r="105%">',
  '      <stop offset="0" stop-color="#6b31c9"/>',
  '      <stop offset="0.42" stop-color="#3a1886"/>',
  '      <stop offset="1" stop-color="#110c36"/>',
  '    </radialGradient>',
  '    <radialGradient id="halo">',
  '      <stop offset="0.5" stop-color="#8b5cf6" stop-opacity="0.42"/>',
  '      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>',
  '    </radialGradient>',
  '    <radialGradient id="moonGlow">',
  '      <stop offset="0" stop-color="#ffe7a8" stop-opacity="0.9"/>',
  '      <stop offset="0.35" stop-color="#fbbf24" stop-opacity="0.38"/>',
  '      <stop offset="1" stop-color="#f59e0b" stop-opacity="0"/>',
  '    </radialGradient>',
  '    <radialGradient id="sphere" cx="68%" cy="28%" r="82%">',
  '      <stop offset="0" stop-color="#fbf4ff"/>',
  '      <stop offset="0.22" stop-color="#d4b8ff"/>',
  '      <stop offset="0.55" stop-color="#8b4cf0"/>',
  '      <stop offset="0.85" stop-color="#4a1a9c"/>',
  '      <stop offset="1" stop-color="#2a0f66"/>',
  '    </radialGradient>',
  '    <radialGradient id="bounce" cx="18%" cy="82%" r="60%">',
  '      <stop offset="0" stop-color="#5b6cff" stop-opacity="0.55"/>',
  '      <stop offset="1" stop-color="#5b6cff" stop-opacity="0"/>',
  '    </radialGradient>',
  '    <linearGradient id="rimWarm" x1="1" y1="0" x2="0.3" y2="0.8">',
  '      <stop offset="0" stop-color="#ffd98a" stop-opacity="0.95"/>',
  '      <stop offset="0.5" stop-color="#ffd98a" stop-opacity="0"/>',
  '    </linearGradient>',
  '    <radialGradient id="moon" cx="40%" cy="36%" r="70%">',
  '      <stop offset="0" stop-color="#fffbeb"/>',
  '      <stop offset="0.35" stop-color="#fde68a"/>',
  '      <stop offset="1" stop-color="#f59e0b"/>',
  '    </radialGradient>',
  `    <clipPath id="sphereClip"><circle cx="${S[0].toFixed(1)}" cy="${S[1].toFixed(1)}" r="${R_SPHERE.toFixed(1)}"/></clipPath>`,
  '    <filter id="blurS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>',
  '    <filter id="blurM" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>',
  '    <filter id="blurL" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>',
  '  </defs>',
  '  <rect width="1024" height="1024" fill="url(#bg)"/>',
  '  <!-- everything but the background; the maskable icon shrinks this group',
  '       into the 80% safe zone (scripts/make-icons.mjs) -->',
  '  <g id="art">',
  `  <circle cx="${S[0].toFixed(1)}" cy="${S[1].toFixed(1)}" r="290" fill="url(#halo)"/>`,
  `  <circle cx="${fmt(ex)}" cy="${fmt(ey)}" r="150" fill="url(#moonGlow)"/>`,
  '  <g>',
  ...back.map(([d, c, o]) => `    <path d="${d}" fill="${c}" fill-opacity="${o}"/>`),
  '  </g>',
  `  <circle cx="${S[0].toFixed(1)}" cy="${S[1].toFixed(1)}" r="${R_SPHERE.toFixed(1)}" fill="url(#sphere)"/>`,
  `  <circle cx="${S[0].toFixed(1)}" cy="${S[1].toFixed(1)}" r="${R_SPHERE.toFixed(1)}" fill="url(#bounce)"/>`,
  '  <g clip-path="url(#sphereClip)">',
  `    <path d="${frontCenter}" fill="none" stroke="#1a0846" stroke-opacity="0.22" stroke-width="${fmt(frontW * 1.1)}" `
    + 'stroke-linecap="round" transform="translate(-10 26)" filter="url(#blurS)"/>',
  '  </g>',
  `  <circle cx="${S[0].toFixed(1)}" cy="${S[1].toFixed(1)}" r="${(R_SPHERE - 4).toFixed(1)}" fill="none" stroke="url(#rimWarm)" stroke-width="8"/>`,
  `  <ellipse cx="${Math.round(S[0] + 52)}" cy="${Math.round(S[1] - 70)}" rx="46" ry="26" fill="#ffffff" fill-opacity="0.55" `
    + `transform="rotate(-38 ${Math.round(S[0] + 52)} ${Math.round(S[1] - 70)})" filter="url(#blurS)"/>`,
  '  <g>',
  ...frontPolys.map(([d, c, o]) => `    <path d="${d}" fill="${c}" fill-opacity="${o}"/>`),
  '  </g>',
  `  <path d="${core}" fill="none" stroke="#ffd27a" stroke-width="30" stroke-linecap="round" stroke-opacity="0.5" filter="url(#blurM)"/>`,
  `  <path d="${core}" fill="none" stroke="#fff6dc" stroke-width="9" stroke-linecap="round" stroke-opacity="0.75"/>`,
  `  <circle cx="${fmt(ex)}" cy="${fmt(ey)}" r="${MOON_R + 16}" fill="#fbbf24" fill-opacity="0.45" filter="url(#blurM)"/>`,
  `  <circle cx="${fmt(ex)}" cy="${fmt(ey)}" r="${MOON_R}" fill="url(#moon)"/>`,
  `  <ellipse cx="${fmt(ex - 16)}" cy="${fmt(ey - 18)}" rx="20" ry="13" fill="#ffffff" fill-opacity="0.85" `
    + `transform="rotate(-30 ${fmt(ex - 16)} ${fmt(ey - 18)})"/>`,
  '  </g>',
  '</svg>',
];

writeFileSync(OUT, svg.join('\n') + '\n');
console.log(`wrote ${OUT}: ${back.length} back + ${frontPolys.length} front segments, gold body at (${ex.toFixed(0)},${ey.toFixed(0)})`);
