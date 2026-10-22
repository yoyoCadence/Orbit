/**
 * PS-250B: the Edit Mode picker for the character style, protagonist and
 * Companion. The choice is stored only on this device, in the V2 state
 * (`world.appearance`). assetManifest.js resolves it, so the home Orbit Window
 * and the full page draw the same characters. PS-250E2 adds the room style,
 * stored in the existing `world.selectedThemeId`.
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

export function renderAppearancePicker(value, roomStyle) {
  const choice = resolveAppearanceChoice(value);
  // An older page does not pass the room (INFRA-105): mark none, so either
  // room can still be chosen.
  const room = roomStyle === undefined ? null : resolveRoomStyleChoice(roomStyle);
  const style = APPEARANCE_STYLES.find(entry => entry.id === choice.style);
  const stored = value && typeof value === 'object' ? value : {};
  const pixelArt = style.id === 'pixel';
  const thumbnail = appearance => getWorkspaceSceneAssets(0, {}, { appearance });
  return `
    <section class="personal-space-v2-appearance" data-v2-appearance-picker aria-labelledby="personal-space-v2-appearance-title">
      <div class="personal-space-v2-editor-heading">
        <div><small>外觀</small><h2 id="personal-space-v2-appearance-title">風格、房間與角色</h2></div>
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

function optionMarkup(kind, option, { selected, stored, src, pixelArt, size = { width: 72, height: 72 } }) {
  return `
    <li>
      <button type="button" data-v2-appearance="${kind}" data-value="${escapeHtml(option.id)}" aria-pressed="${selected}"${stored ? ' data-stored' : ''}>
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
  // appearance (null, which follows the default) as it is.
  const { selectedThemeId, ...appearance } = change;
  return savePersonalSpaceV2State(ownerId, {
    ...state,
    world: {
      ...world,
      ...(selectedThemeId === undefined ? {} : { selectedThemeId }),
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
