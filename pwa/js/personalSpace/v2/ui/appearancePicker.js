/**
 * PS-250B: the Edit Mode picker for the character style, protagonist and
 * Companion. The choice is stored only on this device, in the V2 state
 * (`world.appearance`). assetManifest.js resolves it, so the home Orbit Window
 * and the full page draw the same characters.
 *
 * A new module that only reads existing exports (INFRA-105): the scene
 * resolution in assetManifest.js, the Q-style character list (PS-250C) and the
 * V2 store. The pixel ids mirror assetManifest.js; ps250bAppearance.test.js
 * keeps them in sync.
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
  }),
  Object.freeze({
    id: 'pixel',
    label: '全像素',
    note: '像素角色；像素版的房間與更多角色之後加入',
    protagonists: Object.freeze([Object.freeze({ id: 'default', label: '像素主角' })]),
    companions: Object.freeze([Object.freeze({ id: 'orbit-guide', label: 'Orbit' })]),
  }),
]);

/** The stored choice, with anything unknown replaced the way the scene resolves it. */
export function resolveAppearanceChoice(value) {
  const input = value && typeof value === 'object' ? value : {};
  const style = APPEARANCE_STYLES.find(entry => entry.id === input.style) || APPEARANCE_STYLES[0];
  const pick = (options, id) => (options.some(option => option.id === id) ? id : options[0].id);
  return {
    style: style.id,
    protagonistId: pick(style.protagonists, input.protagonistId),
    companionId: pick(style.companions, input.companionId),
  };
}

export function renderAppearancePicker(value) {
  const choice = resolveAppearanceChoice(value);
  const style = APPEARANCE_STYLES.find(entry => entry.id === choice.style);
  const thumbnail = appearance => getWorkspaceSceneAssets(0, {}, { appearance });
  return `
    <section class="personal-space-v2-appearance" data-v2-appearance-picker aria-labelledby="personal-space-v2-appearance-title">
      <div class="personal-space-v2-editor-heading">
        <div><small>外觀</small><h2 id="personal-space-v2-appearance-title">風格與角色</h2></div>
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
        <legend>主角</legend>
        <ul class="personal-space-v2-appearance-options">
          ${style.protagonists.map(option => optionMarkup('protagonist', option, option.id === choice.protagonistId,
            thumbnail({ ...choice, protagonistId: option.id }).protagonist)).join('')}
        </ul>
      </fieldset>
      <fieldset>
        <legend>AI 夥伴</legend>
        <ul class="personal-space-v2-appearance-options">
          ${style.companions.map(option => optionMarkup('companion', option, option.id === choice.companionId,
            thumbnail({ ...choice, companionId: option.id }).companion.path)).join('')}
        </ul>
      </fieldset>
      <p>選擇只存在這台裝置。預設角色可以離線使用；其他角色第一次顯示時下載，離線時暫時以預設角色顯示。</p>
    </section>
  `;
}

function optionMarkup(kind, option, selected, src) {
  return `
    <li>
      <button type="button" data-v2-appearance="${kind}" data-value="${escapeHtml(option.id)}" aria-pressed="${selected}">
        <img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" draggable="false">
        <span>${escapeHtml(option.label)}</span>
      </button>
    </li>
  `;
}

/** The change a picker button asks for, or null for anything else. */
export function readAppearanceChange(button) {
  const value = button?.dataset?.value;
  if (!value) return null;
  const field = { style: 'style', protagonist: 'protagonistId', companion: 'companionId' }[button.dataset.v2Appearance];
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
  return savePersonalSpaceV2State(ownerId, {
    ...state,
    world: { ...world, appearance: { ...world.appearance, ...change } },
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
