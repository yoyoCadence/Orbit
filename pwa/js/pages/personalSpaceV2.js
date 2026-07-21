import { state as appState } from '../state.js';
import {
  consumePersonalSpaceV2Reveal,
  buildStoredPersonalSpaceV2LedgerSnapshot,
  reconcileAndSavePersonalSpaceV2,
} from '../personalSpace/v2/controller.js';
import {
  loadPersonalSpaceV2State,
  savePersonalSpaceV2State,
} from '../personalSpace/v2/store.js';
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
import { emitPersonalSpaceTelemetry } from '../personalSpace/v2/telemetry.js';

const EDIT_BOUNDS = Object.freeze({ minX: 6, maxX: 94, minY: 28, maxY: 92 });
const EDIT_STEP = 2;

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

const COMPANION_MESSAGES = Object.freeze({
  'companion.project.workspace-upgrade.complete': '正式工作站完成了。這個空間會記得你為它付出的每一次努力。',
  'companion.project.workspace-upgrade.progress': '工作空間有了變化，下一個有意義的步驟也已經清楚可見。',
  'companion.recovery.completed': '恢復也算數。適當休息，是能長久前進的一部分。',
  'companion.session.productive-complete': '剛才完成的工作，已經在這個世界留下痕跡。',
  'companion.momentum.strong': '你最近的節奏很穩定，我會繼續在旁邊陪你一起工作。',
  'companion.goal.gentle-reminder': '你選擇的目標仍在這裡，準備好時再回來就好。',
  'companion.momentum.low': '不用勉強自己，我們可以從一個清楚的小行動重新開始。',
  'companion.observe': '我正在看著這個空間，隨著你的真實努力慢慢改變。',
});

function itemId(item) {
  return item?.id || item?.layoutItemId || item?.itemId || null;
}

function parseCoordinate(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function coordinate(value) {
  return `${Number(value.toFixed(2))}%`;
}

function copyWorldState(v2State) {
  return {
    ...v2State,
    world: {
      ...(v2State?.world || {}),
      placedItems: [...(v2State?.world?.placedItems || [])],
      idleWindowLayouts: { ...(v2State?.world?.idleWindowLayouts || {}) },
    },
  };
}

function withWorldRevision(v2State) {
  return {
    ...v2State,
    worldRevision: Math.max(0, Number(v2State.worldRevision) || 0) + 1,
  };
}

export function listPersonalSpaceV2EditablePlacements(v2State = {}) {
  const world = v2State.world || {};
  const placedItems = (Array.isArray(world.placedItems) ? world.placedItems : [])
    .map((item, index) => {
      const id = itemId(item);
      if (!id) return null;
      const placement = item.placement || {};
      return {
        source: 'placed-item',
        itemIndex: index,
        itemId: id,
        layoutId: null,
        label: item.label || item.name || id,
        x: parseCoordinate(placement.x ?? item.x, 50),
        y: parseCoordinate(placement.y ?? item.y, 70),
      };
    })
    .filter(Boolean);

  const layoutItems = Object.entries(world.idleWindowLayouts || {}).flatMap(([layoutId, layout]) => (
    Object.entries(layout?.placements || {}).map(([id, placement]) => ({
      source: 'layout-override',
      itemIndex: null,
      itemId: id,
      layoutId,
      label: id,
      x: parseCoordinate(placement?.x, 50),
      y: parseCoordinate(placement?.y, 70),
    }))
  ));

  return [...placedItems, ...layoutItems];
}

function matchesTarget(item, index, target) {
  if (Number.isInteger(target.itemIndex)) return index === target.itemIndex;
  return itemId(item) === target.itemId;
}

/** Adjust one existing override inside the fixed-camera safe area. */
export function adjustPersonalSpaceV2Placement(v2State, target, delta = {}) {
  const next = copyWorldState(v2State);
  let changed = false;

  if (target?.source === 'placed-item') {
    next.world.placedItems = next.world.placedItems.map((item, index) => {
      if (!matchesTarget(item, index, target)) return item;
      const placement = { ...(item.placement || {}) };
      const x = clamp(
        parseCoordinate(placement.x ?? item.x, 50) + (Number(delta.x) || 0),
        EDIT_BOUNDS.minX,
        EDIT_BOUNDS.maxX
      );
      const y = clamp(
        parseCoordinate(placement.y ?? item.y, 70) + (Number(delta.y) || 0),
        EDIT_BOUNDS.minY,
        EDIT_BOUNDS.maxY
      );
      changed = true;
      return { ...item, placement: { ...placement, x: coordinate(x), y: coordinate(y) } };
    });
  }

  if (target?.source === 'layout-override') {
    const layout = next.world.idleWindowLayouts[target.layoutId];
    const placement = layout?.placements?.[target.itemId];
    if (placement) {
      const x = clamp(
        parseCoordinate(placement.x, 50) + (Number(delta.x) || 0),
        EDIT_BOUNDS.minX,
        EDIT_BOUNDS.maxX
      );
      const y = clamp(
        parseCoordinate(placement.y, 70) + (Number(delta.y) || 0),
        EDIT_BOUNDS.minY,
        EDIT_BOUNDS.maxY
      );
      next.world.idleWindowLayouts[target.layoutId] = {
        ...layout,
        placements: {
          ...layout.placements,
          [target.itemId]: { ...placement, x: coordinate(x), y: coordinate(y) },
        },
      };
      changed = true;
    }
  }

  return changed ? withWorldRevision(next) : v2State;
}

function withoutCoordinates(placement) {
  if (!placement || typeof placement !== 'object') return null;
  const next = { ...placement };
  delete next.x;
  delete next.y;
  return Object.keys(next).length ? next : null;
}

/** Remove one override while preserving ownership, support, and anchor metadata. */
export function resetPersonalSpaceV2Placement(v2State, target) {
  const next = copyWorldState(v2State);
  let changed = false;

  if (target?.source === 'placed-item') {
    next.world.placedItems = next.world.placedItems.map((item, index) => {
      if (!matchesTarget(item, index, target) || !item.placement) return item;
      const placement = withoutCoordinates(item.placement);
      changed = true;
      if (placement) return { ...item, placement };
      const resetItem = { ...item };
      delete resetItem.placement;
      return resetItem;
    });
  }

  if (target?.source === 'layout-override') {
    const layout = next.world.idleWindowLayouts[target.layoutId];
    if (layout?.placements?.[target.itemId]) {
      const placements = { ...layout.placements };
      delete placements[target.itemId];
      next.world.idleWindowLayouts[target.layoutId] = { ...layout, placements };
      changed = true;
    }
  }

  return changed ? withWorldRevision(next) : v2State;
}

export function resetAllPersonalSpaceV2Placements(v2State) {
  const next = copyWorldState(v2State);
  let changed = false;
  next.world.placedItems = next.world.placedItems.map(item => {
    if (!item?.placement || (item.placement.x === undefined && item.placement.y === undefined)) {
      return item;
    }
    const placement = withoutCoordinates(item.placement);
    changed = true;
    if (placement) return { ...item, placement };
    const resetItem = { ...item };
    delete resetItem.placement;
    return resetItem;
  });
  Object.entries(next.world.idleWindowLayouts).forEach(([layoutId, layout]) => {
    if (!Object.keys(layout?.placements || {}).length) return;
    next.world.idleWindowLayouts[layoutId] = { ...layout, placements: {} };
    changed = true;
  });
  return changed ? withWorldRevision(next) : v2State;
}

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
      label: 'Orbit 夥伴',
      message: COMPANION_MESSAGES[model.companion.dialogueKey]
        || COMPANION_MESSAGES['companion.observe'],
    },
    pendingReveal,
  };
}

function editorMarkup(items) {
  if (!items.length) {
    return '<p class="personal-space-v2-empty">目前沒有可調整的擺放覆寫。</p>';
  }

  return items.map(item => `
    <article
      class="personal-space-v2-editor-item"
      data-v2-editor-item
      data-source="${escapeHtml(item.source)}"
      data-item-id="${escapeHtml(item.itemId)}"
      data-item-index="${Number.isInteger(item.itemIndex) ? item.itemIndex : ''}"
      data-layout-id="${escapeHtml(item.layoutId || '')}"
    >
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <small>水平 ${item.x.toFixed(0)}% · 垂直 ${item.y.toFixed(0)}%</small>
      </div>
      <div class="personal-space-v2-nudge" aria-label="調整 ${escapeHtml(item.label)} 的位置">
        <button type="button" data-v2-nudge data-dx="-${EDIT_STEP}" data-dy="0" aria-label="向左移動">←</button>
        <button type="button" data-v2-nudge data-dx="0" data-dy="-${EDIT_STEP}" aria-label="向上移動">↑</button>
        <button type="button" data-v2-nudge data-dx="0" data-dy="${EDIT_STEP}" aria-label="向下移動">↓</button>
        <button type="button" data-v2-nudge data-dx="${EDIT_STEP}" data-dy="0" aria-label="向右移動">→</button>
        <button type="button" data-v2-reset-item>重設</button>
      </div>
    </article>
  `).join('');
}

function detailPanelMarkup(model) {
  const companionMessage = COMPANION_MESSAGES[model.companion.dialogueKey]
    || COMPANION_MESSAGES['companion.observe'];
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
        <h2 tabindex="-1">Orbit 夥伴</h2>
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

function pageMarkup(model, mode, editorItems, renderWindow) {
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
        <section class="personal-space-v2-editor" data-v2-editor>
          <div class="personal-space-v2-editor-heading">
            <div><small>固定視角</small><h2>擺放微調</h2></div>
            <button type="button" data-v2-reset-all>重設全部調整</button>
          </div>
          <p>僅能在場景安全區內微調既有物件；編輯模式不會產生任何獎勵。</p>
          <div class="personal-space-v2-editor-list">${editorMarkup(editorItems)}</div>
        </section>
      ` : ''}

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

function editorTarget(node) {
  const item = node?.closest('[data-v2-editor-item]');
  if (!item) return null;
  const itemIndex = Number.parseInt(item.dataset.itemIndex, 10);
  return {
    source: item.dataset.source,
    itemId: item.dataset.itemId,
    itemIndex: Number.isInteger(itemIndex) ? itemIndex : null,
    layoutId: item.dataset.layoutId || null,
  };
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
  const saveState = options.saveState || savePersonalSpaceV2State;
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
    panel.hidden = false;
    panel.querySelectorAll('[data-v2-detail]').forEach(section => {
      section.hidden = section.dataset.v2Detail !== detailId;
    });
    panel.querySelector('[data-v2-detail]:not([hidden]) h2')?.focus?.();
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

  function persist(nextState) {
    if (nextState === v2State || disposed) return;
    try {
      v2State = saveState(user.id, nextState, {
        expectedRevision: v2State.worldRevision,
      });
    } catch (error) {
      console.warn('Personal Space V2 edit was not saved; refreshing the latest world state.', error);
      try {
        const refreshed = reconcile({
          user,
          sessions: coreState.sessions || [],
          reconciledAt: options.reconciledAt,
        });
        v2State = refreshed.state;
        ledgerSnapshot = refreshed.ledgerSnapshot || refreshed.reconciliation || ledgerSnapshot;
      } catch (refreshError) {
        console.error('Personal Space V2 could not refresh after a save failure.', refreshError);
      }
      render(mode);
      return;
    }
    render(mode);
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
      coreState,
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
    const editorItems = listPersonalSpaceV2EditablePlacements(v2State);
    container.innerHTML = pageMarkup(model, mode, editorItems, renderWindow);
    const orbitWindow = container.querySelector('[data-orbit-window]');
    if (!orbitWindow) return;

    const mountedModel = mode === 'edit' ? { ...model, pendingReveal: null } : model;
    sceneCleanup = mountWindow(orbitWindow, {
      model: mountedModel,
      renderMode: mode,
      onOpenWorld: mode === 'edit' ? undefined : () => showDetail('project'),
      onProject: mode === 'edit' ? undefined : () => showDetail('project'),
      onCompanion: mode === 'edit' ? undefined : () => showDetail('companion'),
      onMainQuest: mode === 'edit' ? undefined : () => runMainQuest(model.mainQuest),
      onRevealConsumed: acknowledgeReveal,
    });
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

  function handleClick(event) {
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
    if (event.target.closest('[data-v2-main-quest]')) {
      if (currentModel) runMainQuest(currentModel.mainQuest);
      return;
    }

    const nudge = event.target.closest('[data-v2-nudge]');
    if (nudge && mode === 'edit') {
      persist(adjustPersonalSpaceV2Placement(v2State, editorTarget(nudge), {
        x: Number(nudge.dataset.dx) || 0,
        y: Number(nudge.dataset.dy) || 0,
      }));
      return;
    }
    const reset = event.target.closest('[data-v2-reset-item]');
    if (reset && mode === 'edit') {
      persist(resetPersonalSpaceV2Placement(v2State, editorTarget(reset)));
      return;
    }
    if (event.target.closest('[data-v2-reset-all]') && mode === 'edit') {
      persist(resetAllPersonalSpaceV2Placements(v2State));
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

  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', handleKeydown);
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
