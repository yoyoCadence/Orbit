// Theme, UI skin, background image, and the Liquid Glass reflection effect.
// Moved verbatim from app.js — settings.js imports from here (not app.js),
// which breaks the settings ⇄ app circular dependency.

import { storage } from './storage.js';
import { today }   from './utils.js';

// ─── Theme & Background ───────────────────────────────────────────────────────

const _ALL_THEME_IDS = [
  'dark-purple', 'aurora-blue', 'emerald', 'flame', 'neon-pink', 'light',
  'wabi', 'material', 'cyberpunk', 'liquid-galss', 'pixel', 'anime', 'gothic', 'github',
];

export function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  storage.saveTheme(themeId);
}

export function applyUiSkin(skinId) {
  const nextSkin = skinId === 'modern' ? 'modern' : 'classic';
  document.documentElement.setAttribute('data-ui-skin', nextSkin);
  storage.saveUiSkin(nextSkin);
}

/** Pick and apply a random theme for today, but only once per calendar day. Pro only. */
export function applyRandomThemeForToday() {
  if (!storage.getRandomThemeEnabled()) return;
  if (!storage.isProUser()) return;
  const todayStr = today();
  if (storage.getRandomThemeDate() === todayStr) return; // already applied today
  const id = _ALL_THEME_IDS[Math.floor(Math.random() * _ALL_THEME_IDS.length)];
  applyTheme(id);
  storage.saveRandomThemeDate(todayStr);
}

export function applyBgImage(dataUrl) {
  storage.saveBgImage(dataUrl);
  renderBg(dataUrl);
}

export function removeBgImage() {
  storage.saveBgImage(null);
  renderBg(null);
}

export function renderBg(dataUrl) {
  const html = document.documentElement;
  if (dataUrl) {
    document.body.style.backgroundImage = `url(${dataUrl})`;
    document.body.style.backgroundSize  = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    html.classList.add('has-bg');
  } else {
    document.body.style.backgroundImage = '';
    html.classList.remove('has-bg');
  }
}

// ─── Liquid Glass reflection ──────────────────────────────────────────────────

let _liquidGlassMotionStarted = false;
let _liquidGlassPermissionAsked = false;
let _liquidGlassRaf = 0;
let _liquidGlassLastFrame = 0;
let _liquidGlassLiteLastWrite = 0;
const _liquidGlassCurrent = { angle: 136, sheenX: 50, sheenY: 34, rim: 0.58, hazeX: 50, hazeY: 36 };
const _liquidGlassTarget  = { ..._liquidGlassCurrent };

function _isIosChrome() {
  return /CriOS/i.test(window.navigator.userAgent || '');
}

function _isLiquidGlassStaticMotion() {
  return _isIosChrome();
}

function _isLiquidGlassLiteMotion() {
  return window.matchMedia?.('(hover: none), (pointer: coarse), (max-width: 768px)')?.matches ?? false;
}

function _writeLiquidGlassReflection({ angle, sheenX, sheenY, rim, hazeX, hazeY }) {
  const root = document.documentElement;
  root.style.setProperty('--glass-angle', `${Math.max(105, Math.min(165, angle))}deg`);
  root.style.setProperty('--glass-sheen-x', `${Math.max(18, Math.min(82, sheenX))}%`);
  root.style.setProperty('--glass-sheen-y', `${Math.max(8, Math.min(72, sheenY))}%`);
  root.style.setProperty('--glass-rim-strength', Math.max(0.42, Math.min(0.86, rim)).toFixed(2));
  root.style.setProperty('--glass-haze-x', `${Math.max(12, Math.min(88, hazeX))}%`);
  root.style.setProperty('--glass-haze-y', `${Math.max(8, Math.min(82, hazeY))}%`);
}

function _queueLiquidGlassReflection(next) {
  if (_isLiquidGlassStaticMotion()) return;

  if (_isLiquidGlassLiteMotion()) {
    const now = window.performance.now();
    if (now - _liquidGlassLiteLastWrite < 280) return;
    _liquidGlassLiteLastWrite = now;
    Object.keys(_liquidGlassCurrent).forEach(key => {
      const capped = key === 'rim' ? Math.min(next[key], 0.64) : next[key];
      _liquidGlassCurrent[key] += (capped - _liquidGlassCurrent[key]) * 0.35;
    });
    _writeLiquidGlassReflection(_liquidGlassCurrent);
    return;
  }

  Object.assign(_liquidGlassTarget, next);
  if (_liquidGlassRaf || document.hidden) return;
  _liquidGlassRaf = window.requestAnimationFrame(_animateLiquidGlassReflection);
}

function _animateLiquidGlassReflection(timestamp) {
  _liquidGlassRaf = 0;
  if (document.documentElement.dataset.theme !== 'liquid-galss' || document.hidden) return;
  if (timestamp - _liquidGlassLastFrame < 32) {
    _liquidGlassRaf = window.requestAnimationFrame(_animateLiquidGlassReflection);
    return;
  }
  _liquidGlassLastFrame = timestamp;

  let moving = false;
  Object.keys(_liquidGlassCurrent).forEach(key => {
    const current = _liquidGlassCurrent[key];
    const next = current + (_liquidGlassTarget[key] - current) * 0.16;
    _liquidGlassCurrent[key] = next;
    if (Math.abs(_liquidGlassTarget[key] - next) > 0.08) moving = true;
  });

  _writeLiquidGlassReflection(_liquidGlassCurrent);
  if (moving) _liquidGlassRaf = window.requestAnimationFrame(_animateLiquidGlassReflection);
}

function _handleLiquidGlassOrientation(event) {
  if (document.documentElement.dataset.theme !== 'liquid-galss') return;
  const gamma = Number.isFinite(event.gamma) ? event.gamma : 0; // left/right tilt, roughly -90..90
  const beta = Number.isFinite(event.beta) ? event.beta : 0;   // front/back tilt, roughly -180..180
  const tiltX = Math.max(-42, Math.min(42, gamma));
  const tiltY = Math.max(-42, Math.min(42, beta));
  _queueLiquidGlassReflection({
    angle: 136 + tiltX * 0.46 - tiltY * 0.18,
    sheenX: 50 + tiltX * 0.62,
    sheenY: 34 - tiltY * 0.36,
    rim: 0.58 + Math.min(0.24, (Math.abs(tiltX) + Math.abs(tiltY)) / 170),
    hazeX: 50 + tiltX * 0.28,
    hazeY: 36 - tiltY * 0.18,
  });
}

function _startLiquidGlassMotion() {
  if (_isLiquidGlassStaticMotion()) return;
  if (_liquidGlassMotionStarted) return;
  _liquidGlassMotionStarted = true;
  window.addEventListener('deviceorientation', _handleLiquidGlassOrientation, { passive: true });
}

function _requestLiquidGlassMotion() {
  if (_isLiquidGlassStaticMotion()) return;
  if (_liquidGlassPermissionAsked || document.documentElement.dataset.theme !== 'liquid-galss') return;
  _liquidGlassPermissionAsked = true;
  const orientationApi = window.DeviceOrientationEvent;
  if (orientationApi?.requestPermission) {
    orientationApi.requestPermission()
      .then(state => { if (state === 'granted') _startLiquidGlassMotion(); })
      .catch(() => {});
  } else {
    _startLiquidGlassMotion();
  }
}

function _handleLiquidGlassPointer(event) {
  if (document.documentElement.dataset.theme !== 'liquid-galss') return;
  if (_isLiquidGlassLiteMotion()) return;
  const px = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
  const py = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  _queueLiquidGlassReflection({
    angle: 136 + px * 22 - py * 9,
    sheenX: 50 + px * 24,
    sheenY: 34 + py * 18,
    rim: 0.58 + Math.min(0.18, (Math.abs(px) + Math.abs(py)) * 0.08),
    hazeX: 50 + px * 10,
    hazeY: 36 + py * 8,
  });
}

export function initLiquidGlassReflection() {
  _writeLiquidGlassReflection(_liquidGlassCurrent);
  document.documentElement.classList.toggle('liquid-galss-lite-motion', _isLiquidGlassLiteMotion());
  document.documentElement.classList.toggle('liquid-galss-static-motion', _isLiquidGlassStaticMotion());
  if (!window.DeviceOrientationEvent?.requestPermission) _startLiquidGlassMotion();
  window.addEventListener('pointermove', _handleLiquidGlassPointer, { passive: true });
  window.addEventListener('touchstart', _requestLiquidGlassMotion, { passive: true });
  window.addEventListener('click', _requestLiquidGlassMotion, { passive: true });
}
