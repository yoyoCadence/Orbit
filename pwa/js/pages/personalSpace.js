import { state } from '../state.js';
import { buildPersonalSpaceViewModel } from '../personalSpace/index.js';
import { createSceneRuntime } from '../personalSpace/sceneRuntime.js';
import { renderDialogBubblePlaceholder } from '../personalSpace/ui/dialogBubble.js';
import { renderHudOverlayPlaceholder } from '../personalSpace/ui/hudOverlay.js';
import { renderShopPanelPlaceholder } from '../personalSpace/ui/shopPanel.js';

let activeRuntime = null;

export function renderPersonalSpace(container) {
  const user = state.user;
  if (!user) return;

  if (activeRuntime) {
    activeRuntime.destroy();
    activeRuntime = null;
  }

  const model = buildPersonalSpaceViewModel(user);
  const nextUnlock = model.nextUnlock;
  const unlockedItems = model.unlockedMilestones
    .map(item => `<li>Lv.${item.level} · ${escapeHtml(item.label)}</li>`)
    .join('');

  container.innerHTML = `
    <div class="section-title">🏠 個人空間</div>

    <div class="card">
      <div class="card-title">Orbit Personal Space</div>
      <div class="space-hero">
        <div>
          <div class="space-hero-title">Growth becomes a world you can inhabit.</div>
          <div class="space-hero-copy">
            這個頁面是 Orbit life-sim 化的第一階段入口。現在先建立可持續擴張的空間骨架，
            之後再逐步接上場景、家具經濟、角色行為與 AI companion。
          </div>
        </div>
        <div class="space-stage-badge">${formatStage(model.stage)}</div>
      </div>
    </div>

    <div class="space-stats-grid">
      <div class="card space-stat-card">
        <div class="card-title">Current Level</div>
        <div class="space-stat-value">Lv.${model.level}</div>
        <div class="space-stat-copy">${model.xpInfo.currentXP} / ${model.xpInfo.needed} XP to next level</div>
      </div>

      <div class="card space-stat-card">
        <div class="card-title">Available Gold</div>
        <div class="space-stat-value">${model.gold.available}</div>
        <div class="space-stat-copy">Estimated from level rewards. Spent: ${model.gold.spent}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Scene Unlock Progress</div>
      <div class="space-next-unlock">
        ${
          nextUnlock
            ? `<strong>Next unlock: Lv.${nextUnlock.level} · ${escapeHtml(nextUnlock.label)}</strong>
               <span>${Math.max(0, nextUnlock.level - model.level)} level(s) remaining</span>`
            : '<strong>All v0 milestones unlocked</strong><span>Future versions can add prestige scenes and expression layers.</span>'
        }
      </div>
      <ul class="space-unlock-list">${unlockedItems}</ul>
    </div>

    <div class="card">
      <div class="card-title">Scene Runtime Placeholder</div>
      <div id="personal-space-scene" class="space-scene-shell"></div>
    </div>

    <div class="space-placeholder-grid">
      ${renderShopPanelPlaceholder()}
      ${renderDialogBubblePlaceholder()}
      ${renderHudOverlayPlaceholder()}
    </div>
  `;

  const sceneContainer = container.querySelector('#personal-space-scene');
  activeRuntime = createSceneRuntime(sceneContainer, {
    label: nextUnlock ? nextUnlock.label : 'Unlocked Personal Space',
  });
  activeRuntime.mount();
}

function formatStage(stage) {
  return {
    survival: 'Survival Stage',
    building: 'Building Stage',
    mastery: 'Mastery Stage',
  }[stage] || 'Early Stage';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
