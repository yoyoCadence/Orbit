import { state as appState } from '../state.js';
import {
  consumePersonalSpaceV2Reveal,
  buildStoredPersonalSpaceV2LedgerSnapshot,
  reconcileAndSavePersonalSpaceV2,
} from '../personalSpace/v2/controller.js';
import { loadPersonalSpaceV2State } from '../personalSpace/v2/store.js';
import {
  buildEditViewModel,
  buildFullWorldViewModel,
  buildPersonalSpaceV2Snapshot,
} from '../personalSpace/v2/viewModels.js';
import {
  mountOrbitWindow,
  renderOrbitWindow,
} from '../personalSpace/v2/ui/orbitWindow.js';
import { orbitWindowRuntimeDestroyer } from '../personalSpace/v2/runtime/pixiSceneRuntime.js';
import { isAssetGalleryEnabled, renderAssetGallery } from '../personalSpace/v2/ui/assetGallery.js';
import {
  readAppearanceChange,
  renderAppearancePicker,
  saveAppearanceChange,
} from '../personalSpace/v2/ui/appearancePicker.js';
import { COMPANION_NAME, getCompanionDialogue } from '../personalSpace/v2/content/companionDialogue.js';
import { emitPersonalSpaceTelemetry } from '../personalSpace/v2/telemetry.js';
import { describeControl, findControl, watchRemindWindow } from '../personalSpace/v2/remindWindow.js';
import { resolveAchievementPhoto } from '../platform/proofStore.js';

const MOMENTUM_LABELS = Object.freeze({
  low: '低',
  stable: '穩定',
  strong: '強勁',
  peak: '巔峰',
});

const PROJECT_PHASE_LABELS = Object.freeze({
  'empty-work-corner': '空白工作角落',
  'basic-desk': '基礎書桌',
  'light-and-storage': '照明與收納',
  'monitor-and-planning-board': '螢幕與規劃板',
  'formal-workstation': '正式工作站',
});

const RELATIONSHIP_LABELS = Object.freeze({
  'stranger-observer': '陌生觀察者',
  familiar: '熟悉夥伴',
  partner: '合作夥伴',
  'trusted-companion': '信賴夥伴',
});

function describeNextRequirement(requirement) {
  if (!requirement) return '專案已完成';
  if (requirement.label) return requirement.label;
  if (Number.isFinite(requirement.remainingCompletions)) {
    return `再完成 ${requirement.remainingCompletions} 次每日主線任務`;
  }
  return '完成每日主線任務';
}

function rewardLine(reward) {
  const amount = Number(reward?.amount) || 0;
  const sign = reward?.direction === 'reversed' ? '−' : '+';
  const labels = {
    gold: '金幣',
    project_progress: '工作空間進度',
    quest_progress: '主線任務進度',
    hidden_stat: reward?.rewardKey || '隱藏能力',
    world_unlock: '世界解鎖',
    relationship: '夥伴關係',
  };
  return `${labels[reward?.rewardType] || reward?.rewardKey || '世界變化'} ${sign}${Math.abs(amount)}`;
}

function localizePageModel(model) {
  const questTarget = model.mainQuest.actionTarget || {};
  const questCta = model.mainQuest.completed
    ? '今日主線已完成'
    : questTarget.kind === 'create-focus-task'
      ? '建立 A／S 級專注任務'
      : `開始「${questTarget.taskName || '專注任務'}」`;
  const pendingReveal = model.pendingReveal ? {
    ...model.pendingReveal,
    title: model.pendingReveal.direction === 'reversal' ? '世界狀態已回復' : '世界有了新變化',
    lines: Array.isArray(model.pendingReveal.rewards)
      ? model.pendingReveal.rewards.map(rewardLine)
      : model.pendingReveal.lines,
  } : null;

  return {
    ...model,
    activeProject: {
      ...model.activeProject,
      label: model.activeProject.id === 'workspace-upgrade'
        ? '工作空間升級'
        : model.activeProject.label,
      currentPhaseLabel: PROJECT_PHASE_LABELS[model.activeProject.currentPhase]
        || model.activeProject.currentPhaseLabel,
      nextRequirement: model.activeProject.nextRequirement ? {
        ...model.activeProject.nextRequirement,
        label: '完成每日主線任務，推進下一個工作空間階段',
      } : null,
    },
    mainQuest: {
      ...model.mainQuest,
      label: '完成一段至少 25 分鐘的 A／S 級專注任務',
      ctaLabel: questCta,
    },
    companion: {
      ...model.companion,
      label: COMPANION_NAME,
      message: getCompanionDialogue(model.companion.dialogueKey),
    },
    pendingReveal,
  };
}

function detailPanelMarkup(model) {
  const companionMessage = getCompanionDialogue(model.companion.dialogueKey);
  return `
    <aside class="personal-space-v2-detail" data-v2-detail-panel hidden aria-live="polite">
      <button class="personal-space-v2-detail-close" type="button" data-v2-close-detail aria-label="關閉詳細資訊">×</button>
      <section data-v2-detail="project" hidden>
        <small>進行中專案</small>
        <h2 tabindex="-1">${escapeHtml(model.activeProject.label)} · ${model.activeProject.progress}%</h2>
        <p>${escapeHtml(model.activeProject.currentPhaseLabel)}</p>
        <p>${escapeHtml(describeNextRequirement(model.activeProject.nextRequirement))}</p>
      </section>
      <section data-v2-detail="companion" hidden>
        <small>夥伴關係 · ${escapeHtml(RELATIONSHIP_LABELS[model.companion.relationshipStage] || model.companion.relationshipStage)}</small>
        <h2 tabindex="-1">${escapeHtml(COMPANION_NAME)}</h2>
        <p>${escapeHtml(companionMessage)}</p>
      </section>
      <section data-v2-detail="quest" hidden>
        <small>每日主線任務</small>
        <h2 tabindex="-1">${escapeHtml(model.mainQuest.label)}</h2>
        <p>${escapeHtml(model.mainQuest.ctaLabel)}</p>
      </section>
    </aside>
  `;
}

function pageMarkup(model, mode, renderWindow) {
  const level = model.player?.level?.level || 1;
  const sceneModel = mode === 'edit' ? { ...model, pendingReveal: null } : model;
  return `
    <section class="personal-space-v2" data-personal-space-v2 data-mode="${mode}">
      <header class="personal-space-v2-hud">
        <div class="personal-space-v2-title">
          <small>個人空間 V2</small>
          <h1>${mode === 'edit' ? '編輯模式' : '世界模式'}</h1>
        </div>
        <div class="personal-space-v2-hud-stats" role="list" aria-label="世界狀態">
          <span role="listitem">等級 ${level}</span>
          <span role="listitem">金幣 ${model.wallet.balanceGold}</span>
          <span role="listitem">Momentum ${escapeHtml(MOMENTUM_LABELS[model.momentum] || model.momentum)}</span>
          <span role="listitem" aria-label="待處理事件">${model.pendingReveal ? '待揭曉事件 1' : '無待處理事件'}</span>
        </div>
        <div class="personal-space-v2-mode-switch" aria-label="個人空間模式">
          <button type="button" data-v2-mode="full-world" aria-pressed="${mode === 'full-world'}">世界</button>
          <button type="button" data-v2-mode="edit" aria-pressed="${mode === 'edit'}">編輯</button>
        </div>
      </header>

      <div class="personal-space-v2-scene" aria-label="正式工作站場景">
        ${renderWindow(sceneModel, { renderMode: mode })}
      </div>

      ${mode === 'edit' ? `
        <section class="personal-space-v2-editor" data-v2-editor aria-labelledby="personal-space-v2-editor-title">
          <div class="personal-space-v2-editor-heading">
            <div><small>固定視角</small><h2 id="personal-space-v2-editor-title">工作站佈置</h2></div>
          </div>
          <p class="personal-space-v2-empty">工作站家具的位置由固定視角的場景決定，目前不能移動。舊版編輯器的擺放仍保留在舊版場景，不會套用到這裡。</p>
          <p>編輯模式不會產生任何獎勵。</p>
        </section>
        ${renderAppearancePicker(model.appearance, model.selectedThemeId, model.hiddenDecorations)}
      ` : ''}

      ${isAssetGalleryEnabled() ? renderAssetGallery() : ''}

      <nav class="personal-space-v2-dock" aria-label="個人空間操作">
        <button type="button" data-v2-open-detail="project"><span>專案</span><small>${model.activeProject.progress}%</small></button>
        <button type="button" data-v2-main-quest><span>主線任務</span><small>${model.mainQuest.completed ? '已完成' : '專注'}</small></button>
        <button type="button" data-v2-open-detail="companion"><span>夥伴</span><small>${escapeHtml(model.companion.message)}</small></button>
        <button type="button" data-v2-mode="${mode === 'edit' ? 'full-world' : 'edit'}"><span>${mode === 'edit' ? '世界' : '編輯'}</span><small>${mode === 'edit' ? '返回' : '佈置'}</small></button>
      </nav>

      ${detailPanelMarkup(model)}
    </section>
  `;
}

function runMainQuest(mainQuest) {
  if (mainQuest.completed) return;
  if (mainQuest.actionTarget?.kind === 'create-focus-task') {
    window.navigate?.('settings');
    return;
  }
  if (mainQuest.taskId && typeof window.startFocus === 'function') {
    window.startFocus(mainQuest.taskId);
    return;
  }
  window.navigate?.('home');
}

/** Render V2 World/Edit from one reconciled state and return route cleanup. */
export function renderPersonalSpaceV2(container, options = {}) {
  const loadStartedAt = globalThis.performance?.now?.() || Date.now();
  const user = options.user || appState.user;
  if (!container || !user?.id) {
    if (container) container.innerHTML = '<div class="card">個人空間需要有效的本機玩家資料。</div>';
    return () => {};
  }

  const coreState = options.coreState || appState;
  const reconcile = options.reconcile || reconcileAndSavePersonalSpaceV2;
  const consumeReveal = options.consumeReveal || consumePersonalSpaceV2Reveal;
  const renderWindow = options.renderWindow || renderOrbitWindow;
  const mountWindow = options.mountWindow || mountOrbitWindow;
  const destroyRuntime = options.destroyRuntime || (() => orbitWindowRuntimeDestroyer.schedule());
  let result;
  try {
    result = reconcile({ user, sessions: coreState.sessions || [], reconciledAt: options.reconciledAt });
  } catch (error) {
    console.warn('Personal Space V2 reconciliation failed; opening the last readable snapshot.', error);
    try {
      const fallbackState = loadPersonalSpaceV2State(user.id);
      result = {
        state: fallbackState,
        ledgerSnapshot: buildStoredPersonalSpaceV2LedgerSnapshot(fallbackState),
      };
    } catch (fallbackError) {
      console.error('Personal Space V2 failed to load:', fallbackError);
      container.innerHTML = '<div class="card">個人空間暫時無法載入；你的任務與舊版空間資料都沒有被變更。</div>';
      return () => {};
    }
  }

  let v2State = result.state;
  let ledgerSnapshot = result.ledgerSnapshot || result.reconciliation || {};
  let mode = options.initialMode === 'edit' ? 'edit' : 'full-world';
  let sceneCleanup = null;
  let currentModel = null;
  let disposed = false;
  let loadTelemetryEmitted = false;
  let detailInvoker = null;

  // Open the detail panel and remember the control that opened it so focus can be
  // returned there on close (WCAG 2.4.3). Canvas-originated opens have no DOM
  // invoker, so fall back to the matching dock button as the return target.
  function showDetail(detailId, invoker = null) {
    const panel = container.querySelector('[data-v2-detail-panel]');
    if (!panel) return;
    const dockButton = container.querySelector(`[data-v2-open-detail="${detailId}"]`);
    const active = document.activeElement;
    const candidate = invoker
      || (active && active !== document.body && container.contains(active) ? active : null)
      || dockButton;
    detailInvoker = candidate && typeof candidate.focus === 'function' ? candidate : null;
    revealDetailSection(panel, detailId);
    panel.querySelector('[data-v2-detail]:not([hidden]) h2')?.focus?.();
  }

  function revealDetailSection(panel, detailId) {
    panel.hidden = false;
    panel.querySelectorAll('[data-v2-detail]').forEach(section => {
      section.hidden = section.dataset.v2Detail !== detailId;
    });
  }

  // AI-203B: the reminder window opening or closing re-renders the page, which
  // must not close the detail the user is reading or drop their focus.
  function refreshForRemindWindow() {
    if (disposed) return;
    const panel = container.querySelector('[data-v2-detail-panel]');
    const openDetail = panel && !panel.hidden
      ? panel.querySelector('[data-v2-detail]:not([hidden])')?.dataset.v2Detail
      : null;
    const invokerKey = describeControl(container, detailInvoker);
    const focusKey = describeControl(container, document.activeElement);
    render(mode);
    const nextPanel = container.querySelector('[data-v2-detail-panel]');
    if (openDetail && nextPanel) {
      revealDetailSection(nextPanel, openDetail);
      detailInvoker = findControl(container, invokerKey)
        || container.querySelector(`[data-v2-open-detail="${openDetail}"]`);
    }
    // preventScroll: restoring focus must not move the page the user scrolled.
    findControl(container, focusKey)?.focus?.({ preventScroll: true });
  }

  function hideDetail() {
    const panel = container.querySelector('[data-v2-detail-panel]');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const invoker = detailInvoker;
    detailInvoker = null;
    if (invoker && container.contains(invoker) && typeof invoker.focus === 'function') {
      invoker.focus();
    }
  }

  function acknowledgeReveal(revealId) {
    if (!revealId || disposed) return;
    const consumed = consumeReveal({ user, revealId });
    if (!consumed?.persisted) return;
    v2State = consumed.state;
    ledgerSnapshot = {
      ...ledgerSnapshot,
      pendingRewardReveals: v2State.pendingRewardReveals,
      recentWorldChange: v2State.recentWorldChange,
      recentWorldChangeEventId: v2State.recentWorldChangeEventId,
      revision: v2State.worldRevision,
      worldRevision: v2State.worldRevision,
    };
    render(mode);
  }

  function render(nextMode = mode) {
    if (disposed) return;
    mode = nextMode === 'edit' ? 'edit' : 'full-world';
    sceneCleanup?.();
    sceneCleanup = null;

    const snapshot = buildPersonalSpaceV2Snapshot({
      coreState: {
        ...coreState,
        achievementPhoto: resolveAchievementPhoto(user.id, coreState.sessions),
      },
      v2State,
      ledgerSnapshot,
      now: options.now,
      effectiveDate: options.effectiveDate,
    });
    const baseModel = mode === 'edit'
      ? buildEditViewModel(snapshot)
      : buildFullWorldViewModel(snapshot);
    const model = localizePageModel(baseModel);
    currentModel = model;
    container.innerHTML = pageMarkup(model, mode, renderWindow);
    const orbitWindow = container.querySelector('[data-orbit-window]');
    if (!orbitWindow) return;

    const mountedModel = mode === 'edit' ? { ...model, pendingReveal: null } : model;
    const releaseWindow = mountWindow(orbitWindow, {
      model: mountedModel,
      renderMode: mode,
      onOpenWorld: mode === 'edit' ? undefined : () => showDetail('project'),
      onProject: mode === 'edit' ? undefined : () => showDetail('project'),
      onCompanion: mode === 'edit' ? undefined : () => showDetail('companion'),
      onMainQuest: mode === 'edit' ? undefined : () => runMainQuest(model.mainQuest),
      onRevealConsumed: acknowledgeReveal,
    });
    // AI-203B: re-render when the Companion's reminder window opens or closes.
    const stopRemindWatch = watchRemindWindow(refreshForRemindWindow);
    sceneCleanup = () => {
      stopRemindWatch();
      releaseWindow?.();
    };
    if (!loadTelemetryEmitted) {
      loadTelemetryEmitted = true;
      const loadEndedAt = globalThis.performance?.now?.() || Date.now();
      emitPersonalSpaceTelemetry('personal_space_loaded', {
        renderMode: mode,
        renderPath: 'v2-pixi',
        loadMs: Math.max(0, Math.round(loadEndedAt - loadStartedAt)),
        projectPhase: model.activeProject.currentPhase,
      });
    }
  }

  // PS-250B: store the chosen style or character (PS-250E2: or room;
  // PS-250F: or a decoration switch) and redraw with it; focus returns to the
  // same option in the new markup.
  function changeAppearance(button) {
    const change = readAppearanceChange(button);
    if (!change) return;
    let saved = null;
    try {
      saved = saveAppearanceChange(user.id, change);
    } catch (error) {
      console.warn('Personal Space V2 appearance could not be saved.', error);
    }
    if (!saved) return;
    v2State = saved;
    const { v2Appearance, value } = button.dataset;
    render(mode);
    container.querySelector(`[data-v2-appearance="${v2Appearance}"][data-value="${value}"]`)?.focus?.();
  }

  function handleClick(event) {
    const appearanceButton = event.target.closest('[data-v2-appearance]');
    if (appearanceButton) {
      changeAppearance(appearanceButton);
      return;
    }
    const modeButton = event.target.closest('[data-v2-mode]');
    if (modeButton) {
      if (modeButton.dataset.v2Mode === 'edit' && mode !== 'edit') {
        const ownedCount = Array.isArray(v2State.inventory?.ownedItems)
          ? v2State.inventory.ownedItems.length
          : 0;
        emitPersonalSpaceTelemetry('edit_mode_opened', {
          sceneId: currentModel?.sceneId || 'office-corner',
          ownedCountBand: ownedCount === 0 ? '0' : ownedCount < 5 ? '1-4' : ownedCount < 10 ? '5-9' : '10+',
        });
      }
      render(modeButton.dataset.v2Mode);
      return;
    }

    const detailButton = event.target.closest('[data-v2-open-detail]');
    if (detailButton) {
      showDetail(detailButton.dataset.v2OpenDetail, detailButton);
      return;
    }
    if (event.target.closest('[data-v2-close-detail]')) {
      hideDetail();
      return;
    }
    if (event.target.closest('[data-v2-main-quest]') && currentModel) {
      runMainQuest(currentModel.mainQuest);
    }
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') return;
    const panel = container.querySelector('[data-v2-detail-panel]');
    if (panel && !panel.hidden) {
      event.preventDefault();
      hideDetail();
    }
  }

  // PS-250G: a picker picture that cannot load (offline, never downloaded)
  // shows its precached default. 'error' does not bubble, so it is caught on
  // the way down; the poster's images have their own fallback steps.
  function handlePickerImageError(event) {
    const image = event.target;
    if (image?.tagName !== 'IMG' || !image.closest('[data-v2-appearance-picker]')) return;
    const fallback = image.dataset.fallbackSrc;
    if (!fallback || image.getAttribute('src') === fallback) return;
    // The defaults are Q-style images: smooth scaling again.
    image.removeAttribute('data-pixel-art');
    image.setAttribute('src', fallback);
  }

  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', handleKeydown);
  container.addEventListener('error', handlePickerImageError, true);
  render(mode);

  return () => {
    if (disposed) return;
    disposed = true;
    try {
      sceneCleanup?.();
    } finally {
      sceneCleanup = null;
      container.removeEventListener('click', handleClick);
      container.removeEventListener('keydown', handleKeydown);
      container.removeEventListener('error', handlePickerImageError, true);
      destroyRuntime();
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
