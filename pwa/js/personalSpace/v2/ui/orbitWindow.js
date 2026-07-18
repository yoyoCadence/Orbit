import { getWorkspaceSceneAssets } from '../content/assetManifest.js';
import {
  orbitWindowRuntime,
  orbitWindowRuntimeDestroyer,
} from '../runtime/pixiSceneRuntime.js';
import { emitPersonalSpaceTelemetry } from '../telemetry.js';

const COMPANION_DIALOGUE_MESSAGES = Object.freeze({
  'companion.project.workspace-upgrade.complete': '工作站完成了。這個房間記得你一路累積的努力。',
  'companion.project.workspace-upgrade.progress': '工作空間改變了，下一個有用的步驟已經看得見。',
  'companion.recovery.completed': '休息也算數。穩定的節奏需要恢復。',
  'companion.session.productive-complete': '這次行動在空間裡留下了痕跡。',
  'companion.momentum.strong': '你最近的節奏很穩，我會繼續陪你前進。',
  'companion.goal.gentle-reminder': '你選擇的目標還在這裡，準備好時再開始。',
  'companion.momentum.low': '不用急，我們可以從一個清楚的小行動重新開始。',
  'companion.observe': '我會在這裡看著你的空間慢慢成形。',
});

const REVEAL_DURATIONS_MS = Object.freeze({
  small: Object.freeze({ standard: 2200, reduced: 500 }),
  medium: Object.freeze({ standard: 4200, reduced: 750 }),
  major: Object.freeze({ standard: 6000, reduced: 1000 }),
});

export function getRevealDurationMs(kind, reducedMotion = false) {
  const tier = REVEAL_DURATIONS_MS[normalizeRevealKind(kind)];
  return reducedMotion ? tier.reduced : tier.standard;
}

export function renderOrbitWindow(inputModel = {}, options = {}) {
  const model = normalizeOrbitWindowModel(inputModel, options.renderMode);
  const scene = getWorkspaceSceneAssets(model.activeProject.progress, model.placements);
  const rewardLines = buildRewardLines(model.pendingReveal);
  const revealKind = model.pendingReveal?.kind || null;

  return `
    <section
      class="orbit-window orbit-window--${escapeHtml(model.renderMode)} ${revealKind ? `is-revealing orbit-window--reveal-${revealKind}` : ''} orbit-window--weather-${escapeHtml(model.weather)}"
      data-orbit-window
      data-render-mode="${escapeHtml(model.renderMode)}"
      data-project-progress="${model.activeProject.progress}"
      data-player-state="${escapeHtml(model.protagonist.state)}"
      data-companion-state="${escapeHtml(model.companion.state)}"
      data-weather="${escapeHtml(model.weather)}"
      ${revealKind ? `data-reveal-kind="${revealKind}"` : ''}
      aria-labelledby="orbit-window-title"
    >
      <div class="orbit-window-heading">
        <div>
          <span class="orbit-window-eyebrow">PERSONAL SPACE · 即時世界</span>
          <h2 id="orbit-window-title">${escapeHtml(model.sceneLabel)}</h2>
        </div>
        <span class="orbit-window-momentum" data-momentum="${escapeHtml(model.momentum)}">${escapeHtml(momentumLabel(model.momentum))}</span>
      </div>

      <div class="orbit-window-stage-wrap">
        <button class="orbit-window-stage-action" type="button" data-orbit-open-world aria-label="進入完整 Personal Space">
          <span class="orbit-window-poster" aria-hidden="true">
            <img class="orbit-window-background" src="${escapeHtml(scene.background)}" alt="" draggable="false">
            ${scene.props.map(renderPosterProp).join('')}
            <img
              class="orbit-window-protagonist"
              data-player-state="${escapeHtml(model.protagonist.state)}"
              src="${escapeHtml(scene.protagonist)}"
              alt=""
              draggable="false"
              style="${placementStyle(scene.protagonistPlacement)}"
            >
            <span
              class="orbit-window-companion"
              data-companion-state="${escapeHtml(model.companion.state)}"
              style="${placementStyle(scene.companionPlacement)}"
            ><span></span></span>
            <span class="orbit-window-weather" data-weather="${escapeHtml(model.weather)}"></span>
            <span class="orbit-window-light orbit-window-light--${escapeHtml(model.timeBand)}"></span>
          </span>
          <span class="orbit-window-runtime-host" data-orbit-runtime-host data-runtime-status="poster"></span>
        </button>

        <div class="orbit-window-reward" role="status" aria-live="polite" aria-atomic="true">
          ${model.pendingReveal ? `
            <strong>${escapeHtml(model.pendingReveal.title || '世界已更新')}</strong>
            <span>${rewardLines.map(escapeHtml).join(' · ')}</span>
          ` : `<span>${escapeHtml(model.recentWorldChange || scene.phase.label)}</span>`}
        </div>
      </div>

      ${revealKind === 'major' ? `
        <div class="orbit-window-major-reveal" aria-hidden="true">
          <span>WORLD MILESTONE</span>
          <strong>${escapeHtml(model.pendingReveal.title || '世界里程碑已解鎖')}</strong>
        </div>
      ` : ''}

      <div class="orbit-window-state-grid">
        <button class="orbit-window-state-card" type="button" data-orbit-project>
          <span>ACTIVE PROJECT</span>
          <strong>${escapeHtml(model.activeProject.label)}</strong>
          <span>${escapeHtml(scene.phase.label)} · ${model.activeProject.progress}%</span>
          <span class="orbit-window-progress" aria-label="專案進度 ${model.activeProject.progress}%">
            <span style="width:${model.activeProject.progress}%"></span>
          </span>
        </button>
        <button class="orbit-window-state-card" type="button" data-orbit-companion>
          <span>COMPANION</span>
          <strong>${escapeHtml(model.companion.label)}</strong>
          <span>${escapeHtml(model.companion.message)}</span>
        </button>
      </div>

      <button
        class="orbit-window-main-quest"
        type="button"
        data-orbit-main-quest
        ${model.mainQuest.taskId ? `data-task-id="${escapeHtml(model.mainQuest.taskId)}"` : ''}
      >
        <span><small>今日 Main Quest</small><strong>${escapeHtml(model.mainQuest.label)}</strong></span>
        <span>${escapeHtml(model.mainQuest.ctaLabel)}</span>
      </button>
      <p class="orbit-window-runtime-note" data-orbit-runtime-note>場景會在進入可視區後載入；任務功能不需等待。</p>
    </section>
  `;
}

export function mountOrbitWindow(root, options = {}) {
  if (!root) return () => {};
  const runtime = options.runtime || orbitWindowRuntime;
  if (runtime === orbitWindowRuntime) orbitWindowRuntimeDestroyer.retain();
  const model = normalizeOrbitWindowModel(options.model || {}, options.renderMode);
  const runtimeHost = root.querySelector('[data-orbit-runtime-host]');
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  let observer = null;
  let idleId = null;
  let revealTimer = null;
  let started = false;
  let disposed = false;
  let startRequested = false;
  let runtimeReady = false;
  let runtimeActive = false;
  let runtimeReleased = false;
  let isInViewport = 'IntersectionObserver' in globalThis ? null : true;
  let lastVisibility = document.hidden ? 'hidden' : 'visible';
  const revealId = model.pendingReveal?.id || null;
  let revealRemainingMs = revealId
    ? getRevealDurationMs(model.pendingReveal.kind, reducedMotion)
    : 0;
  let revealStartedAt = null;
  let revealConsumed = false;
  let revealTelemetryStarted = false;
  let windowViewedEmitted = false;
  const revealDurationMs = revealId
    ? getRevealDurationMs(model.pendingReveal.kind, reducedMotion)
    : 0;
  const revealTelemetryProperties = revealId ? {
    rewardBatchType: model.pendingReveal.direction || 'settlement',
    revealClass: model.pendingReveal.kind,
    renderMode: model.renderMode,
    reducedMotion,
  } : null;

  const emitWindowViewed = runtimeReadyValue => {
    if (windowViewedEmitted) return;
    windowViewedEmitted = true;
    emitPersonalSpaceTelemetry('orbit_window_viewed', {
      renderPath: runtimeReadyValue ? 'pixi' : 'poster-fallback',
      projectPhase: model.activeProject.currentPhase,
      runtimeReady: runtimeReadyValue,
    }, { eventId: `orbit-window-viewed:${model.renderMode}:${model.worldRevision}:${runtimeReadyValue}` });
  };

  const pauseRevealClock = () => {
    if (revealTimer === null) return;
    globalThis.clearTimeout(revealTimer);
    revealTimer = null;
    if (revealStartedAt !== null) {
      revealRemainingMs = Math.max(0, revealRemainingMs - (Date.now() - revealStartedAt));
    }
    revealStartedAt = null;
  };

  const syncRevealClock = () => {
    if (!revealId || revealConsumed || disposed) return;
    const canPresentReveal = !document.hidden && isInViewport === true;
    if (!canPresentReveal) {
      pauseRevealClock();
      return;
    }
    if (revealTimer !== null) return;
    if (revealRemainingMs <= 0) {
      revealConsumed = true;
      emitPersonalSpaceTelemetry('reward_reveal_completed', {
        ...revealTelemetryProperties,
        durationMs: revealDurationMs,
        completionMode: 'timer',
      }, { eventId: `${revealId}:completed` });
      options.onRevealConsumed?.(revealId);
      return;
    }
    if (!revealTelemetryStarted) {
      revealTelemetryStarted = true;
      emitPersonalSpaceTelemetry('reward_reveal_started', revealTelemetryProperties, {
        eventId: `${revealId}:started`,
      });
    }
    revealStartedAt = Date.now();
    revealTimer = globalThis.setTimeout(() => {
      revealTimer = null;
      revealStartedAt = null;
      revealRemainingMs = 0;
      if (disposed || revealConsumed) return;
      revealConsumed = true;
      emitPersonalSpaceTelemetry('reward_reveal_completed', {
        ...revealTelemetryProperties,
        durationMs: revealDurationMs,
        completionMode: 'timer',
      }, { eventId: `${revealId}:completed` });
      options.onRevealConsumed?.(revealId);
    }, revealRemainingMs);
  };

  const syncRuntimeActivity = () => {
    if (!runtimeReady || disposed) return;
    const shouldBeActive = !document.hidden && isInViewport !== false;
    if (shouldBeActive === runtimeActive) return;
    runtimeActive = shouldBeActive;
    if (shouldBeActive) runtime.resume?.();
    else runtime.suspend?.();
  };

  const startRuntime = () => {
    startRequested = true;
    if (started || disposed || !runtimeHost || document.hidden) return;
    started = true;
    Promise.resolve()
      .then(() => runtime.mount(runtimeHost, model))
      .then(() => {
        if (disposed) return;
        runtimeReady = true;
        runtimeActive = true;
        emitWindowViewed(true);
        syncRuntimeActivity();
      })
      .catch(() => {
        if (disposed) return;
        runtimeHost.dataset.runtimeStatus = 'fallback';
        emitWindowViewed(false);
        const note = root.querySelector('[data-orbit-runtime-note]');
        if (note) note.textContent = '互動場景暫時無法載入，已保留靜態世界與所有任務功能。';
      });
  };

  const handleVisibilityChange = () => {
    const nextVisibility = document.hidden ? 'hidden' : 'visible';
    if (nextVisibility === lastVisibility || disposed) return;
    lastVisibility = nextVisibility;
    if (nextVisibility === 'hidden') {
      syncRuntimeActivity();
      syncRevealClock();
      return;
    }
    if (!runtimeReady && startRequested && isInViewport !== false) startRuntime();
    syncRuntimeActivity();
    syncRevealClock();
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if ('IntersectionObserver' in globalThis) {
    observer = new globalThis.IntersectionObserver(entries => {
      if (disposed) return;
      const nextInViewport = entries.some(entry => entry.isIntersecting);
      if (nextInViewport === isInViewport) return;
      isInViewport = nextInViewport;
      if (nextInViewport && !started) startRuntime();
      syncRuntimeActivity();
      syncRevealClock();
    }, { rootMargin: '160px' });
    observer.observe(root);
    if (model.pendingReveal) startRuntime();
  } else if (model.pendingReveal) {
    startRuntime();
  } else if (typeof globalThis.requestIdleCallback === 'function') {
    idleId = globalThis.requestIdleCallback(startRuntime, { timeout: 1200 });
  } else {
    idleId = globalThis.setTimeout(startRuntime, 0);
  }

  const actionBindings = [];
  bindAction('[data-orbit-open-world]', () => {
    emitPersonalSpaceTelemetry('orbit_window_opened', {
      entryPoint: model.renderMode,
      projectPhase: model.activeProject.currentPhase,
    });
    options.onOpenWorld?.();
  });
  bindAction('[data-orbit-project]', () => options.onProject?.(model.activeProject));
  bindAction('[data-orbit-companion]', () => {
    emitPersonalSpaceTelemetry('companion_interacted', {
      companionState: model.companion.state,
      interactionKey: model.companion.interactionKey,
      renderMode: model.renderMode,
    });
    options.onCompanion?.(model.companion);
  });
  bindAction('[data-orbit-main-quest]', () => options.onMainQuest?.(model.mainQuest));

  function bindAction(selector, handler) {
    const target = root.querySelector(selector);
    if (!target) return;
    target.addEventListener('click', handler);
    actionBindings.push([target, handler]);
  }

  syncRevealClock();

  return () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    if (idleId !== null) {
      if (typeof globalThis.cancelIdleCallback === 'function') globalThis.cancelIdleCallback(idleId);
      else globalThis.clearTimeout(idleId);
    }
    pauseRevealClock();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    actionBindings.forEach(([target, handler]) => target.removeEventListener('click', handler));
    if (!runtimeReleased) {
      runtimeReleased = true;
      if (typeof runtime.release === 'function') runtime.release(runtimeHost);
      else runtime.suspend?.();
    }
  };
}

export function normalizeOrbitWindowModel(input = {}, renderMode) {
  const project = input.activeProject || input.project || input.world?.activeProject || {};
  const companion = input.companion || input.companionState || input.world?.companion || {};
  const quest = input.mainQuest || input.quest || {};
  const rawPendingReveal = input.pendingReveal || input.world?.pendingReveal || input.world?.revealQueue?.[0] || null;
  const pendingReveal = rawPendingReveal
    ? { ...rawPendingReveal, kind: normalizeRevealKind(rawPendingReveal.kind) }
    : null;
  const protagonist = input.protagonist || input.world?.protagonist || {};
  const requestedRenderMode = renderMode ?? input.renderMode ?? 'home-window';
  const recentWorldChange = input.recentWorldChange
    ?? input.recentWorldChangeEvent
    ?? input.world?.recentWorldChange
    ?? input.world?.recentWorldChangeEvent
    ?? null;

  return {
    renderMode: ['home-window', 'full-world', 'edit'].includes(requestedRenderMode)
      ? requestedRenderMode
      : 'home-window',
    sceneId: input.sceneId || input.world?.selectedSceneId || 'office-corner',
    sceneLabel: input.sceneLabel || 'Building Stage · 正式工作站',
    worldRevision: Number.isFinite(input.worldRevision) ? input.worldRevision : 0,
    activeProject: {
      id: project.id || 'workspace-upgrade-v1',
      label: project.label || 'Workspace Upgrade',
      progress: clampPercent(project.progress),
      currentPhase: project.currentPhase || project.phase || 'bare',
      nextRequirement: project.nextRequirement || '',
    },
    mainQuest: {
      id: quest.id || 'main-focus',
      taskId: quest.taskId || null,
      actionTarget: quest.actionTarget || null,
      label: quest.label || '完成一次 25 分鐘以上的 A／S Focus 任務',
      ctaLabel: quest.ctaLabel || (quest.taskId ? '開始專注 →' : '查看條件 →'),
      completed: Boolean(quest.completed),
    },
    companion: {
      id: companion.id || 'orbit-guide',
      label: companion.label || 'Orbit Guide',
      state: companion.state || companion.activity || 'observe',
      interactionKey: companion.interactionKey || companion.dialogueKey || companion.state || 'observe',
      message: companion.message
        || companion.dialogue
        || COMPANION_DIALOGUE_MESSAGES[companion.dialogueKey]
        || companion.dialogueKey
        || COMPANION_DIALOGUE_MESSAGES['companion.observe'],
    },
    protagonist: {
      state: protagonist.state || input.playerState || 'idle',
      animationKey: protagonist.animationKey || protagonist.state || input.playerState || 'idle',
    },
    pendingReveal,
    recentWorldChange: formatRecentWorldChange(recentWorldChange),
    momentum: input.momentum || 'low',
    timeBand: input.timeBand || 'day',
    weather: input.weather === 'rain' ? 'rain' : 'clear',
    placements: input.placements || input.world?.placements || {},
  };
}

function normalizeRevealKind(value) {
  return ['small', 'medium', 'major'].includes(value) ? value : 'small';
}

function renderPosterProp(entry) {
  return `<img class="orbit-window-prop" src="${escapeHtml(entry.path)}" alt="" draggable="false" style="${placementStyle(entry.placement)}">`;
}

function placementStyle(placement = {}) {
  const anchor = placement.anchor === 'center' ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)';
  return [
    `left:${toPercent(placement.x, 50)}`,
    `top:${toPercent(placement.y, 50)}`,
    `width:${toPercent(placement.width, 10)}`,
    `z-index:${Number.isFinite(placement.z) ? placement.z : 1}`,
    `transform:${anchor}${placement.rotation ? ` rotate(${placement.rotation}deg)` : ''}${placement.scale ? ` scale(${placement.scale})` : ''}`,
  ].join(';');
}

function buildRewardLines(reveal) {
  if (!reveal) return [];
  if (Array.isArray(reveal.lines)) return reveal.lines;
  if (Array.isArray(reveal.rewards)) {
    return reveal.rewards.map(entry => {
      if (entry.label) return entry.label;
      const key = entry.metadata?.statKey || entry.rewardKey || entry.rewardType;
      const amount = Number(entry.amount) || 0;
      const signedAmount = entry.direction === 'reversed'
        ? `-${Math.abs(amount)}`
        : `${amount >= 0 ? '+' : ''}${amount}`;
      return `${key} ${signedAmount}`;
    });
  }
  return [reveal.message || '世界狀態已同步'];
}

function formatRecentWorldChange(change) {
  if (!change) return null;
  if (typeof change === 'string') return change;
  if (typeof change !== 'object') return String(change);

  const message = change.label
    || change.message
    || change.title
    || change.summary
    || change.description
    || change.text;
  if (message) return String(message);

  const subject = change.rewardKey || change.key || change.rewardType || change.type;
  if (!subject) return null;
  const amount = Number.isFinite(change.amount) ? change.amount : Number.parseFloat(change.amount);
  if (!Number.isFinite(amount) || amount === 0) return String(subject);
  return `${subject} ${amount > 0 ? `+${amount}` : amount}`;
}

function momentumLabel(value) {
  return { low: 'Momentum · Low', stable: 'Momentum · Stable', strong: 'Momentum · Strong', peak: 'Momentum · Peak' }[value]
    || 'Momentum · Low';
}

function clampPercent(value) {
  const numeric = Number.isFinite(value) ? value : Number.parseFloat(value) || 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function toPercent(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value.includes('%') ? value : `${value}%`;
  return `${Number.isFinite(value) ? value : fallback}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
