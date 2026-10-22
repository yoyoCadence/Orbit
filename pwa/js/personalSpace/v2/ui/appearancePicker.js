/**
 * PS-250B: the Edit Mode picker for the character style, protagonist and
 * Companion. The choice is stored only on this device, in the V2 state
 * (`world.appearance`). assetManifest.js resolves it, so the home Orbit Window
 * and the full page draw the same characters. PS-250E2 adds the room style,
 * stored in the existing `world.selectedThemeId`, and PS-250F the decorations
 * (`world.hiddenDecorations`, the ones switched off).
 *
 * A new module that only reads existing exports (INFRA-105): the scene
 * resolution in assetManifest.js, the Q-style character list (PS-250C) and the
 * V2 store, and since PS-250D the pixel set, which has the same ids plus the
 * PS-242 characters. The pixel ids and aliases mirror assetManifest.js;
 * ps250bAppearance.test.js keeps them in sync.
 */
import { getWorkspaceSceneAssets } from '../content/assetManifest.js';
import { TOON_COMPANIONS, TOON_PROTAGONISTS } from '../content/characterCatalog.js';
import { hasPersonalSpaceV2State, loadPersonalSpaceV2State, savePersonalSpaceV2State } from '../store.js';

export const APPEARANCE_STYLES = Object.freeze([
  Object.freeze({
    id: 'toon',
    label: '全 Q 版',
    note: 'Blender 卡通角色（預設）',
    protagonists: TOON_PROTAGONISTS,
    companions: TOON_COMPANIONS,
    // The classic pixel characters are the office worker and Orbit.
    aliases: Object.freeze({ default: 'office', 'orbit-guide': 'orbit' }),
  }),
  // PS-250D: the pixel style has the pixel version of every Q-style character
  // (same ids, so a choice carries over between styles) plus the PS-242 pixel
  // characters.
  Object.freeze({
    id: 'pixel',
    label: '全像素',
    note: '像素版的房間、家具與角色',
    protagonists: Object.freeze([...TOON_PROTAGONISTS, Object.freeze({ id: 'default', label: '經典像素主角' })]),
    companions: Object.freeze([...TOON_COMPANIONS, Object.freeze({ id: 'orbit-guide', label: '經典 Orbit' })]),
  }),
]);

// PS-250E2: room styles. The ids mirror ROOM_STYLE_IDS in assetManifest.js
// (ps250e2RoomStyles.test.js keeps them in sync).
export const ROOM_STYLES = Object.freeze([
  Object.freeze({ id: 'default', label: '藍色工作室' }),
  Object.freeze({ id: 'nordic', label: '明亮北歐' }),
  Object.freeze({ id: 'washitsu', label: '日式和風' }),
  Object.freeze({ id: 'nightowl', label: '夜貓工作室' }),
  Object.freeze({ id: 'study', label: '深木書房' }),
]);

// PS-250F: decorations (user decision, 2026-10-22), switched on and off in
// Edit Mode. The ids mirror DECOR_DEFINITIONS in assetManifest.js
// (ps250fDecorations.test.js keeps them in sync).
export const DECORATIONS = Object.freeze([
  Object.freeze({ id: 'deco-trophy', label: '獎盃' }),
  Object.freeze({ id: 'deco-globe', label: '地球儀' }),
  Object.freeze({ id: 'deco-beanbag', label: '懶骨頭' }),
  Object.freeze({ id: 'deco-floor-lamp', label: '落地燈' }),
  Object.freeze({ id: 'deco-succulent', label: '多肉盆栽' }),
  Object.freeze({ id: 'deco-coffee', label: '咖啡杯組' }),
]);

/** The stored room style, or the default for anything unknown (legacy theme ids too). */
export function resolveRoomStyleChoice(value) {
  return ROOM_STYLES.some(entry => entry.id === value) ? value : ROOM_STYLES[0].id;
}

/** The stored choice, with anything unknown replaced the way the scene resolves it. */
export function resolveAppearanceChoice(value) {
  const input = value && typeof value === 'object' ? value : {};
  const style = APPEARANCE_STYLES.find(entry => entry.id === input.style) || APPEARANCE_STYLES[0];
  const aliases = style.aliases || {};
  const pick = (options, id) => {
    if (options.some(option => option.id === id)) return id;
    const alias = typeof id === 'string' && Object.hasOwn(aliases, id) ? aliases[id] : null;
    return options.some(option => option.id === alias) ? alias : options[0].id;
  };
  return {
    style: style.id,
    protagonistId: pick(style.protagonists, input.protagonistId),
    companionId: pick(style.companions, input.companionId),
  };
}

export function renderAppearancePicker(value, roomStyle, hiddenDecorations) {
  const choice = resolveAppearanceChoice(value);
  // An older page does not pass the room (INFRA-105): mark none, so either
  // room can still be chosen.
  const room = roomStyle === undefined ? null : resolveRoomStyleChoice(roomStyle);
  const style = APPEARANCE_STYLES.find(entry => entry.id === choice.style);
  const stored = value && typeof value === 'object' ? value : {};
  const pixelArt = style.id === 'pixel';
  const thumbnail = appearance => getWorkspaceSceneAssets(0, {}, { appearance });
  // An older page does not pass the hidden decorations, and an older
  // assetManifest.js cannot draw them: no switches then. Each switch shows
  // the decoration of the chosen room (PS-250F2: each room has its own).
  const decorationPaths = new Map((getWorkspaceSceneAssets(100, {}, { appearance: choice }, {
    roomStyle: room ?? undefined,
  }).decorations || []).map(entry => [entry.id, entry.path]));
  const hidden = Array.isArray(hiddenDecorations) ? hiddenDecorations : null;
  const decorations = hidden ? DECORATIONS.filter(option => decorationPaths.has(option.id)) : [];
  return `
    <section class="personal-space-v2-appearance" data-v2-appearance-picker aria-labelledby="personal-space-v2-appearance-title">
      <div class="personal-space-v2-editor-heading">
        <div><small>外觀</small><h2 id="personal-space-v2-appearance-title">風格、房間、裝飾與角色</h2></div>
      </div>
      <fieldset>
        <legend>風格</legend>
        <div class="personal-space-v2-appearance-styles">
          ${APPEARANCE_STYLES.map(entry => `
            <button type="button" data-v2-appearance="style" data-value="${escapeHtml(entry.id)}" aria-pressed="${entry.id === choice.style}">
              <span>${escapeHtml(entry.label)}</span>
              <small>${escapeHtml(entry.note)}</small>
            </button>
          `).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>房間</legend>
        <ul class="personal-space-v2-appearance-options personal-space-v2-appearance-rooms">
          ${ROOM_STYLES.map(option => optionMarkup('room', option, {
            selected: option.id === room,
            stored: option.id === roomStyle,
            src: getWorkspaceSceneAssets(0, {}, { appearance: choice }, { roomStyle: option.id }).background,
            pixelArt,
            size: { width: 108, height: 72 },
          })).join('')}
        </ul>
      </fieldset>
      ${decorations.length ? `
        <fieldset>
          <legend>裝飾</legend>
          <ul class="personal-space-v2-appearance-options personal-space-v2-appearance-decorations">
            ${decorations.map(option => optionMarkup('decoration', option, {
              selected: !hidden.includes(option.id),
              stored: false,
              src: decorationPaths.get(option.id),
              pixelArt,
              describedBy: 'personal-space-v2-decorations-hint',
            })).join('')}
          </ul>
          <small id="personal-space-v2-decorations-hint">點一下顯示或收起，每個房間都適用。書架與桌上的小物在書架、書桌出現後才會擺上。</small>
        </fieldset>
      ` : ''}
      <fieldset>
        <legend>主角</legend>
        <ul class="personal-space-v2-appearance-options">
          ${style.protagonists.map(option => optionMarkup('protagonist', option, {
            selected: option.id === choice.protagonistId,
            stored: option.id === stored.protagonistId,
            src: thumbnail({ ...choice, protagonistId: option.id }).protagonist,
            pixelArt,
          })).join('')}
        </ul>
      </fieldset>
      <fieldset>
        <legend>AI 夥伴</legend>
        <ul class="personal-space-v2-appearance-options">
          ${style.companions.map(option => optionMarkup('companion', option, {
            selected: option.id === choice.companionId,
            stored: option.id === stored.companionId,
            src: thumbnail({ ...choice, companionId: option.id }).companion.path,
            pixelArt,
          })).join('')}
        </ul>
      </fieldset>
      <p>選擇只存在這台裝置。預設的全 Q 版與藍色工作室可以離線使用；其他房間、角色與全像素的房間、家具第一次顯示時下載，離線時暫時以預設顯示。</p>
    </section>
  `;
}

function optionMarkup(kind, option, { selected, stored, src, pixelArt, size = { width: 72, height: 72 }, describedBy }) {
  return `
    <li>
      <button type="button" data-v2-appearance="${kind}" data-value="${escapeHtml(option.id)}" aria-pressed="${selected}"${stored ? ' data-stored' : ''}${describedBy ? ` aria-describedby="${describedBy}"` : ''}>
        <img src="${escapeHtml(src)}" alt="" width="${size.width}" height="${size.height}" loading="lazy" decoding="async" draggable="false"${pixelArt ? ' data-pixel-art' : ''}>
        <span>${escapeHtml(option.label)}</span>
      </button>
    </li>
  `;
}

/**
 * The change a picker button asks for, or null for anything else. The option
 * that is both shown and stored is no change. An option shown in place of a
 * stored id that this style does not have (the classic pixel office worker is
 * shown as the Q-style one) is stored, so the choice becomes explicit.
 */
export function readAppearanceChange(button) {
  const value = button?.dataset?.value;
  if (!value) return null;
  const kind = button.dataset.v2Appearance;
  const shown = button.getAttribute?.('aria-pressed') === 'true';
  // PS-250F: a decoration switch turns that decoration off or on.
  if (kind === 'decoration') return shown ? { hideDecoration: value } : { showDecoration: value };
  if (shown && (kind === 'style' || kind === 'room' || button.hasAttribute?.('data-stored'))) return null;
  if (kind === 'room') return { selectedThemeId: value };
  const field = { style: 'style', protagonist: 'protagonistId', companion: 'companionId' }[kind];
  return field ? { [field]: value } : null;
}

/**
 * Stores the change on top of the latest saved state and returns that state.
 * Ids stay as chosen when the style changes, so switching back restores them.
 * Returns null without writing when there is no saved state yet: creating one
 * here would skip the legacy migration that the controller runs first.
 */
export function saveAppearanceChange(ownerId, change) {
  if (!hasPersonalSpaceV2State(ownerId)) return null;
  const state = loadPersonalSpaceV2State(ownerId);
  const world = state.world || {};
  // The room style is its own field; a room change leaves an unchosen
  // appearance (null, which follows the default) as it is. So are the hidden
  // decorations: ids this version does not know stay hidden.
  const { selectedThemeId, hideDecoration, showDecoration, ...appearance } = change;
  const hidden = new Set(Array.isArray(world.hiddenDecorations) ? world.hiddenDecorations : []);
  if (hideDecoration) hidden.add(hideDecoration);
  if (showDecoration) hidden.delete(showDecoration);
  return savePersonalSpaceV2State(ownerId, {
    ...state,
    world: {
      ...world,
      ...(selectedThemeId === undefined ? {} : { selectedThemeId }),
      ...(hideDecoration || showDecoration ? { hiddenDecorations: [...hidden] } : {}),
      ...(Object.keys(appearance).length ? { appearance: { ...world.appearance, ...appearance } } : {}),
    },
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
