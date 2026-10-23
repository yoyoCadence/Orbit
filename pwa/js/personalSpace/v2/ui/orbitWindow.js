import { getWorkspaceSceneAssets } from '../content/assetManifest.js';
import { COMPANION_NAME, getCompanionDialogue } from '../content/companionDialogue.js';
import {
  orbitWindowRuntime,
  orbitWindowRuntimeDestroyer,
} from '../runtime/pixiSceneRuntime.js';
import { emitPersonalSpaceTelemetry } from '../telemetry.js';

const NIGHT_ROOM_LIGHT_OPACITY = 0.5;
const NIGHT_ROOM_FRAME_FILTER = 'brightness(0.65)';

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
  // PS-250E1: the time band picks the day or night room. It is passed as its
  // own option: the model also reaches the manifest as visualState.
  // PS-250E2: so is the room style (world.selectedThemeId).
  // PS-250F: and the decorations hidden in Edit Mode.
  const sceneOptions = { timeBand: model.timeBand, hiddenDecorations: model.hiddenDecorations };
  const scene = getWorkspaceSceneAssets(model.activeProject.progress, model.placements, model, {
    ...sceneOptions,
    roomStyle: model.selectedThemeId,
  });
  // PS-250B/D/E2: only the default style and room are precached. A chosen
  // character, room style, or the pixel room and props, that is not cached
  // yet falls back to the default when it cannot load.
  const fallback = getWorkspaceSceneAssets(
    model.activeProject.progress,
    model.placements,
    { ...model, appearance: null },
    sceneOptions,
  );
  // PS-250E1: the night room is already dark. Its light layer only tints the
  // characters and weather, and the achievement frame is dimmed to match.
  const nightRoom = scene.lighting === 'night';
  const lightClass = nightRoom ? 'night' : model.timeBand;
  // The day room is the last resort when a night image cannot load either
  // (an interrupted update, offline): a night prop then becomes the day prop
  // at the day placement, as before PS-250E1.
  const day = nightRoom
    ? getWorkspaceSceneAssets(model.activeProject.progress, model.placements, { ...model, appearance: null }, {
      hiddenDecorations: model.hiddenDecorations,
    })
    : null;
  const dayProps = new Map((day?.props || []).map(entry => [entry.id, entry]));
  const fallbackProps = new Map(fallback.props.map(entry => [entry.id, entry.path]));
  // PS-250F: decorations fall back the same way; one that cannot load at all
  // is an empty image (alt=""), so the room is drawn without it.
  const dayDecorations = new Map((day?.decorations || []).map(entry => [entry.id, entry]));
  const fallbackDecorations = new Map((fallback.decorations || []).map(entry => [entry.id, entry.path]));
  // PS-250D: pixel images keep their hard pixel edges when scaled (CSS
  // image-rendering on [data-pixel-art]); a fallback image drops the marker.
  const pixelArt = scene.appearance?.style === 'pixel' ? ' data-pixel-art' : '';
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
            <img class="orbit-window-background" src="${escapeHtml(scene.background)}" data-fallback-src="${escapeHtml(fallback.background)}"${day ? ` data-day-src="${escapeHtml(day.background)}"` : ''}${pixelArt} alt="" draggable="false">
            ${scene.props.map(entry => renderPosterProp(entry, fallbackProps.get(entry.id), pixelArt, dayProps.get(entry.id))).join('')}
            ${(scene.decorations || []).map(entry => renderPosterProp(entry, fallbackDecorations.get(entry.id), pixelArt, dayDecorations.get(entry.id), true)).join('')}
            <img
              class="orbit-window-protagonist"
              data-player-state="${escapeHtml(model.protagonist.state)}"
              src="${escapeHtml(scene.protagonist)}"
              data-fallback-src="${escapeHtml(fallback.protagonist)}"${pixelArt}
              alt=""
              draggable="false"
              style="${placementStyle(scene.protagonistPlacement)}"
            >
            <img
              class="orbit-window-companion"
              data-companion-state="${escapeHtml(model.companion.state)}"
              src="${escapeHtml(scene.companion.path)}"
              data-fallback-src="${escapeHtml(fallback.companion.path)}"${pixelArt}
              alt=""
              draggable="false"
              style="${placementStyle(scene.companionPlacement)}"
            >
            <img
              class="orbit-window-weather"
              data-weather="${escapeHtml(model.weather)}"
              src="${escapeHtml(scene.weatherOverlay)}"
              alt=""
              draggable="false"
            >
            <span class="orbit-window-light orbit-window-light--${escapeHtml(lightClass)}"${nightRoom ? ` style="opacity: ${NIGHT_ROOM_LIGHT_OPACITY}"` : ''}></span>
          </span>
          <span class="orbit-window-runtime-host" data-orbit-runtime-host data-runtime-status="poster"></span>
          ${renderAchievementPhoto(model.achievementPhoto, { dim: nightRoom })}
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

// PS-249A: what covers the whole app. These three stay in the DOM and open by
// dropping `hidden`; the others are added to <body> while open and must be
// removed when they close (only <body>'s children are observed, so hiding one
// in place would leave the app covered until <body> changes again).
const PERSISTENT_OVERLAY_IDS = Object.freeze(['focus-overlay', 'levelup-overlay', 'focus-duration-picker']);
const BODY_OVERLAY_SELECTOR = '.modal-overlay, .pro-sheet-overlay, .shield-confirm-overlay, .tour-backdrop, .proof-lightbox';
// The CSS animations of a reveal, replayed from the start after an overlay.
const REVEAL_ANIMATIONS = new Set([
  'orbit-reward-rise',
  'orbit-character-celebrate',
  'orbit-companion-approach',
  'orbit-medium-reveal',
  'orbit-major-reveal',
]);

function isOverlayOpen(overlay) {
  return Boolean(overlay) && !overlay.hidden && !overlay.classList.contains('hidden');
}

function isAppCovered(persistentOverlays) {
  return persistentOverlays.some(isOverlayOpen)
    || [...(document.body?.children || [])]
      .some(element => element.matches(BODY_OVERLAY_SELECTOR) && isOverlayOpen(element));
}

function afterTwoFrames(callback) {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    const timer = globalThis.setTimeout(callback, 32);
    return () => globalThis.clearTimeout(timer);
  }
  let frame = globalThis.requestAnimationFrame(() => {
    frame = globalThis.requestAnimationFrame(callback);
  });
  return () => globalThis.cancelAnimationFrame?.(frame);
}

// Re-adding the reveal classes restarts every class-driven reveal animation,
// including those that already finished and, without a fill mode, are gone
// (the celebration, the medium frame's ::after). The major banner keeps its
// animation (fill: both), so it is rewound instead.
function restartRevealAnimations(root) {
  const revealClasses = [...root.classList]
    .filter(name => name === 'is-revealing' || name.startsWith('orbit-window--reveal-'));
  root.classList.remove(...revealClasses);
  void root.offsetWidth;
  root.classList.add(...revealClasses);
  (root.getAnimations?.({ subtree: true }) || [])
    .filter(animation => REVEAL_ANIMATIONS.has(animation.animationName))
    .forEach(animation => { animation.currentTime = 0; });
}

export function mountOrbitWindow(root, options = {}) {
  if (!root) return () => {};
  const runtime = options.runtime || orbitWindowRuntime;
  if (runtime === orbitWindowRuntime) orbitWindowRuntimeDestroyer.retain();
  const model = normalizeOrbitWindowModel(options.model || {}, options.renderMode);
  useFallbackWhenImagesFail(root);
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
  // INFRA-106, PS-249A: keep the scene still while an overlay covers the app
  // instead of redrawing it every frame underneath.
  const persistentOverlays = PERSISTENT_OVERLAY_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);
  let covered = isAppCovered(persistentOverlays);
  let coverObserver = null;
  let cancelUncover = null;
  const revealId = model.pendingReveal?.id || null;
  // PS-249A: the scene observer reaches 160px past the viewport to start early;
  // a reveal only plays while the Orbit Window itself is on screen.
  let revealObserver = null;
  let revealInView = revealId && 'IntersectionObserver' in globalThis ? null : true;
  // An overlay covered the reveal before it ended: play it again from the start.
  let replayReveal = Boolean(revealId) && covered;
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

  const consumeReveal = () => {
    revealConsumed = true;
    root.classList.remove('is-reveal-held');
  };

  const syncRevealClock = () => {
    if (!revealId || revealConsumed || disposed) return;
    const canPresentReveal = !document.hidden && revealInView === true && !covered;
    // PS-249A: style.css pauses the reveal animations and hides the major
    // banner while the reveal is held.
    root.classList.toggle('is-reveal-held', !canPresentReveal);
    if (!canPresentReveal) {
      pauseRevealClock();
      return;
    }
    if (replayReveal) {
      replayReveal = false;
      revealRemainingMs = revealDurationMs;
      restartRevealAnimations(root);
    }
    if (revealTimer !== null) return;
    if (revealRemainingMs <= 0) {
      consumeReveal();
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
      consumeReveal();
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
    const shouldBeActive = !document.hidden && isInViewport !== false && !covered;
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

  if (revealId && 'IntersectionObserver' in globalThis) {
    revealObserver = new globalThis.IntersectionObserver(entries => {
      if (disposed) return;
      const nextInView = entries.some(entry => entry.isIntersecting);
      if (nextInView === revealInView) return;
      revealInView = nextInView;
      syncRevealClock();
    }, { rootMargin: '0px' });
    revealObserver.observe(root);
  }

  const applyCovered = nextCovered => {
    if (nextCovered === covered) return;
    covered = nextCovered;
    if (covered && revealId && !revealConsumed) replayReveal = true;
    syncRuntimeActivity();
    syncRevealClock();
  };

  if ('MutationObserver' in globalThis) {
    coverObserver = new globalThis.MutationObserver(() => {
      if (disposed) return;
      if (isAppCovered(persistentOverlays)) {
        cancelUncover?.();
        cancelUncover = null;
        applyCovered(true);
        return;
      }
      if (!covered || cancelUncover) return;
      // A tour step removes its backdrop and adds the next one two frames
      // later; wait as long before treating the app as uncovered.
      cancelUncover = afterTwoFrames(() => {
        cancelUncover = null;
        if (!disposed) applyCovered(isAppCovered(persistentOverlays));
      });
    });
    if (document.body) coverObserver.observe(document.body, { childList: true });
    persistentOverlays.forEach(overlay => {
      coverObserver.observe(overlay, { attributes: true, attributeFilter: ['class', 'hidden'] });
    });
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
    revealObserver?.disconnect();
    coverObserver?.disconnect();
    cancelUncover?.();
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
    ? { ...rawPendingReveal, kind: normalizeRevealKind(rawPendingReveal.kind, rawPendingReveal.direction) }
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
      label: companion.label || COMPANION_NAME,
      state: companion.state || companion.activity || 'observe',
      interactionKey: companion.interactionKey || companion.dialogueKey || companion.state || 'observe',
      message: companion.message
        || companion.dialogue
        || getCompanionDialogue(companion.dialogueKey),
    },
    protagonist: {
      state: protagonist.state || input.playerState || 'idle',
      animationKey: protagonist.animationKey || protagonist.state || input.playerState || 'idle',
      facing: protagonist.facing === 'right' || input.playerFacing === 'right' ? 'right' : 'left',
    },
    pendingReveal,
    recentWorldChange: formatRecentWorldChange(recentWorldChange),
    momentum: input.momentum || 'low',
    timeBand: input.timeBand || 'day',
    weather: input.weather === 'rain' ? 'rain' : 'clear',
    placements: input.placements || input.world?.placements || {},
    appearance: input.appearance || input.world?.appearance || null,
    selectedThemeId: input.selectedThemeId || input.world?.selectedThemeId || null,
    hiddenDecorations: input.hiddenDecorations || input.world?.hiddenDecorations || [],
    achievementPhoto: normalizeAchievementPhoto(input.achievementPhoto),
  };
}

// PS-250B: a chosen character that is neither cached nor reachable (offline)
// shows the default character, which is precached. The pages mount right after
// inserting the markup, before a load can fail, so the listener sees the error.
// PS-250E1: a night room image then falls back once more, to the day room.
function useFallbackWhenImagesFail(root) {
  root.querySelectorAll?.('img[data-fallback-src]').forEach(image => {
    const steps = [
      { src: image.dataset.fallbackSrc },
      { src: image.dataset.daySrc, style: image.dataset.dayStyle },
    ].filter((step, index, all) => step.src
      && step.src !== image.getAttribute('src')
      && all.findIndex(other => other.src === step.src) === index);
    if (!steps.length) return;
    const next = () => {
      const step = steps.shift();
      // The fallbacks are Q-style images: smooth scaling again.
      image.removeAttribute('data-pixel-art');
      if (step.style) image.setAttribute('style', step.style);
      image.setAttribute('src', step.src);
      if (!steps.length) image.removeEventListener('error', next);
    };
    image.addEventListener('error', next);
  });
}

export function updateOrbitWindowAchievementPhoto(root, input = {}) {
  const current = root?.querySelector?.('[data-achievement-photo]');
  if (!current) return false;
  const shell = document.createElement('div');
  shell.innerHTML = renderAchievementPhoto(normalizeAchievementPhoto(input), {
    dim: current.hasAttribute('data-night-dim'),
  });
  const next = shell.firstElementChild;
  if (!next) return false;
  current.replaceWith(next);
  return true;
}

function normalizeAchievementPhoto(input = {}) {
  const sessionId = typeof input.sessionId === 'string' && input.sessionId.trim()
    ? input.sessionId.trim()
    : null;
  const src = typeof input.src === 'string'
    && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(input.src)
    ? input.src
    : null;
  const requestedStatus = ['empty', 'unavailable', 'selected'].includes(input.status)
    ? input.status
    : 'empty';
  const status = requestedStatus === 'selected' && !src ? 'unavailable' : requestedStatus;
  return {
    status,
    sessionId,
    src: status === 'selected' ? src : null,
    taskName: typeof input.taskName === 'string' ? input.taskName : null,
    completedAt: typeof input.completedAt === 'string' ? input.completedAt : null,
  };
}

// The frame and its photo are dimmed together under the night room (user
// decision, 2026-10-21); otherwise the frame is the brightest thing in it.
function renderAchievementPhoto(input = {}, { dim = false } = {}) {
  const photo = normalizeAchievementPhoto(input);
  const selected = photo.status === 'selected' && photo.src;
  const title = selected
    ? `展示中的成就佐證：${photo.taskName || '已完成任務'}`
    : photo.status === 'unavailable'
      ? '原本的成就佐證目前無法使用'
      : '尚未選擇成就佐證';
  return `
    <span
      class="orbit-window-achievement-frame orbit-window-achievement-frame--${photo.status}"
      data-achievement-photo
      data-photo-status="${photo.status}"
      title="${escapeHtml(title)}"
      aria-hidden="true"${dim ? ` data-night-dim style="filter: ${NIGHT_ROOM_FRAME_FILTER}"` : ''}
    >
      <span class="orbit-window-achievement-mat">
        ${selected
          ? `<img src="${escapeHtml(photo.src)}" alt="" draggable="false">`
          : '<span class="orbit-window-achievement-placeholder">✦</span>'}
      </span>
    </span>
  `;
}

function normalizeRevealKind(value, direction) {
  // Older versions queued an undo as `major` (BUG-113); taking rewards back is
  // never a world milestone.
  if (value === 'major' && direction === 'reversal') return 'medium';
  return ['small', 'medium', 'major'].includes(value) ? value : 'small';
}

// A decoration keeps the prop class, so an older style.css still places it.
function renderPosterProp(entry, fallbackSrc = entry.path, pixelArt = '', day = null, decoration = false) {
  const dayAttributes = day
    ? ` data-day-src="${escapeHtml(day.path)}" data-day-style="${placementStyle(day.placement)}"`
    : '';
  const className = decoration ? 'orbit-window-prop orbit-window-decoration' : 'orbit-window-prop';
  const decorationId = decoration ? ` data-decoration-id="${escapeHtml(entry.id)}"` : '';
  return `<img class="${className}"${decorationId} src="${escapeHtml(entry.path)}" data-fallback-src="${escapeHtml(fallbackSrc)}"${dayAttributes}${pixelArt} alt="" draggable="false" style="${placementStyle(entry.placement)}">`;
}

function placementStyle(placement = {}) {
  const anchor = placement.anchor === 'center' ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)';
  const z = Math.round(toFiniteStyleNumber(placement.z, 1, 0, 999));
  const rotation = toFiniteStyleNumber(placement.rotation, 0, -360, 360);
  const scale = toFiniteStyleNumber(placement.scale, 1, 0.1, 4);
  return [
    `left:${toPercent(placement.x, 50)}`,
    `top:${toPercent(placement.y, 50)}`,
    `width:${toPercent(placement.width, 10, 1, 100)}`,
    `z-index:${z}`,
    `transform:${anchor}${rotation ? ` rotate(${rotation}deg)` : ''}${scale !== 1 ? ` scale(${scale})` : ''}`,
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

function toPercent(value, fallback, min = 0, max = 100) {
  return `${toFiniteStyleNumber(value, fallback, min, max)}%`;
}

function toFiniteStyleNumber(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  const numeric = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
