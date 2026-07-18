import { getLevelInfo } from '../../engine.js';
import { getTimeBand as getSharedTimeBand } from '../../timeBand.js';
import { getCompanionReaction } from './companionEngine.js';
import { deriveMomentum } from './momentum.js';

export const PERSONAL_SPACE_V2_RENDER_MODES = Object.freeze({
  HOME_WINDOW: 'home-window',
  FULL_WORLD: 'full-world',
  EDIT: 'edit',
});

export const PERSONAL_SPACE_V2_WEATHER = Object.freeze(['clear', 'rain']);

const HIDDEN_STAT_KEYS = Object.freeze([
  'discipline',
  'depth',
  'vitality',
  'order',
  'courage',
  'craft',
]);

const PROJECT_PHASES = Object.freeze([
  { progress: 0, key: 'empty-work-corner', label: 'Empty work corner' },
  { progress: 25, key: 'basic-desk', label: 'Basic desk' },
  { progress: 50, key: 'light-and-storage', label: 'Light and storage' },
  { progress: 75, key: 'monitor-and-planning-board', label: 'Monitor and planning board' },
  { progress: 100, key: 'formal-workstation', label: 'Formal workstation' },
]);

const RELATIONSHIP_STAGES = Object.freeze([
  'stranger-observer',
  'familiar',
  'partner',
  'trusted-companion',
]);

function finite(value, fallback = null) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cloneValue(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());

  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  Object.entries(value).forEach(([key, entry]) => {
    clone[key] = cloneValue(entry, seen);
  });
  return clone;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach(entry => deepFreeze(entry, seen));
  return Object.freeze(value);
}

function immutable(value) {
  return deepFreeze(cloneValue(value));
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveEffectiveDate(coreState, options) {
  if (typeof options.effectiveDate === 'string' && options.effectiveDate.trim()) {
    return options.effectiveDate.trim();
  }
  if (typeof coreState.effectiveDate === 'string' && coreState.effectiveDate.trim()) {
    return coreState.effectiveDate.trim();
  }

  const supplied = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const now = Number.isNaN(supplied.getTime()) ? new Date() : new Date(supplied.getTime());
  const newDayHour = finite(coreState.user?.newDayHour, 5);
  if (now.getHours() < newDayHour) now.setDate(now.getDate() - 1);
  return localDateString(now);
}

/** Accept either the shared numeric hour contract or a Date-like value. */
export function getTimeBand(value = new Date()) {
  if (Number.isFinite(value)) return getSharedTimeBand(value);
  const date = value instanceof Date ? value : new Date(value);
  return getSharedTimeBand(Number.isNaN(date.getTime()) ? undefined : date.getHours());
}

export function getWeather(value) {
  return PERSONAL_SPACE_V2_WEATHER.includes(value) ? value : 'clear';
}

export function isMainQuestTaskEligible(task) {
  return Boolean(
    task
    && task.impactType === 'task'
    && task.category === 'focus'
    && (task.value === 'A' || task.value === 'S')
    && task.archived !== true
    && task.disabled !== true
    && task.available !== false
    && task.isActive !== false
  );
}

export function isMainQuestSessionEligible(session, effectiveDate = null) {
  return Boolean(
    session
    && (!effectiveDate || session.date === effectiveDate)
    && session.result === 'complete'
    && session.impactType === 'task'
    && (session.value === 'A' || session.value === 'S')
    && finite(session.durationMinutes, 0) >= 25
  );
}

export function selectCanonicalMainQuestSession(sessions, effectiveDate) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter(session => isMainQuestSessionEligible(session, effectiveDate))
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const leftCompletedAt = String(left.session.completedAt || '');
      const rightCompletedAt = String(right.session.completedAt || '');
      return leftCompletedAt.localeCompare(rightCompletedAt)
        || String(left.session.id || '').localeCompare(String(right.session.id || ''))
        || left.index - right.index;
    })[0]?.session ?? null;
}

/** Daily Plan order wins; the task list order is the deterministic fallback. */
export function selectMainQuestActionTarget(tasks, dailyPlan) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const taskById = new Map(taskList.map(task => [task?.id, task]));
  const plan = Array.isArray(dailyPlan) ? dailyPlan : [];

  for (const entry of plan) {
    const task = entry && typeof entry === 'object' ? entry : taskById.get(entry);
    if (isMainQuestTaskEligible(task)) return buildTaskActionTarget(task, 'daily-plan');
  }

  const task = taskList.find(isMainQuestTaskEligible);
  if (task) return buildTaskActionTarget(task, 'tasks');

  return immutable({
    kind: 'create-focus-task',
    taskId: null,
    taskName: null,
    source: 'task-creation',
    route: 'settings',
    requiredMinutes: 25,
    label: 'Create an A/S Focus task',
  });
}

function buildTaskActionTarget(task, source) {
  return immutable({
    kind: 'start-focus',
    taskId: task.id,
    taskName: task.name || 'Focus task',
    source,
    route: 'home',
    requiredMinutes: 25,
    label: `Start ${task.name || 'Focus task'}`,
  });
}

function getAggregate(ledgerSnapshot) {
  return ledgerSnapshot.summary
    || ledgerSnapshot.aggregate
    || ledgerSnapshot.aggregates
    || {};
}

function readProgress(value, projectId = null) {
  if (Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  if (projectId && Number.isFinite(value[projectId])) return value[projectId];
  for (const key of [
    'workspace-upgrade',
    'workspace-upgrade-v1',
    'daily-main-quest',
    'main-focus',
  ]) {
    if (Number.isFinite(value[key])) return value[key];
  }
  return finite(value.progress, finite(value.amount, finite(value.value)));
}

function resolveActiveProject(v2State, ledgerSnapshot) {
  const aggregate = getAggregate(ledgerSnapshot);
  const source = ledgerSnapshot.project
    || ledgerSnapshot.activeProject
    || v2State.activeProject
    || {};
  const id = source.id || 'workspace-upgrade';
  const rawProgress = readProgress(source, id)
    ?? readProgress(ledgerSnapshot.projectProgress, id)
    ?? readProgress(aggregate.projectProgress, id)
    ?? readProgress(aggregate.project_progress, id)
    ?? 0;
  const progress = clamp(Math.round(rawProgress), 0, 100);
  const phaseIndex = PROJECT_PHASES.reduce(
    (selected, phase, index) => progress >= phase.progress ? index : selected,
    0
  );
  const phase = PROJECT_PHASES[Math.max(0, phaseIndex)];
  const nextPhase = PROJECT_PHASES[phaseIndex + 1] || null;

  return {
    id,
    label: source.label || 'Workspace Upgrade',
    progress,
    percentage: progress,
    phaseIndex,
    currentPhase: phase.key,
    currentPhaseLabel: phase.label,
    completed: progress >= 100,
    completedAt: source.completedAt || null,
    nextRequirement: nextPhase ? {
      kind: 'daily-main-quest',
      amount: Math.max(0, nextPhase.progress - progress),
      targetProgress: nextPhase.progress,
      nextPhase: nextPhase.key,
      label: `Complete the Daily Main Quest to reach ${nextPhase.label}`,
    } : null,
  };
}

function resolveQuestSettlement(ledgerSnapshot, entries, effectiveDate) {
  const questId = `main-focus:${effectiveDate}`;
  const entry = entries.find(reward => (
    reward?.rewardType === 'quest_progress'
    && reward.rewardKey === questId
    && finite(reward.amount, 0) > 0
  )) || null;
  const winner = (Array.isArray(ledgerSnapshot.dailyQuestWinners)
    ? ledgerSnapshot.dailyQuestWinners
    : []).find(session => session?.date === effectiveDate);
  const aggregate = getAggregate(ledgerSnapshot);
  const datedProgress = aggregate.questProgress?.[questId]
    ?? aggregate.quest_progress?.[questId]
    ?? ledgerSnapshot.questProgress?.[questId];
  const progress = entry
    ? finite(entry.amount, 0)
    : winner
      ? 1
      : finite(datedProgress, 0);

  return {
    progress: clamp(Math.floor(progress), 0, 1),
    sourceId: entry?.sourceId || winner?.id || null,
    winner,
  };
}

function resolveMainQuest(coreState, ledgerSnapshot, entries, effectiveDate) {
  const sessions = Array.isArray(coreState.sessions) ? coreState.sessions : [];
  const settlement = resolveQuestSettlement(ledgerSnapshot, entries, effectiveDate);
  const progress = settlement.progress;
  const sourceSession = sessions.find(session => session?.id === settlement.sourceId)
    || settlement.winner
    || null;
  const target = selectMainQuestActionTarget(coreState.tasks, coreState.dailyPlan);
  const actionTarget = progress >= 1 ? {
    kind: 'completed',
    taskId: sourceSession?.taskId || target.taskId,
    taskName: sourceSession?.taskName || target.taskName,
    source: 'completed-session',
    route: null,
    requiredMinutes: 25,
    label: 'Daily Main Quest complete',
  } : target;

  return {
    id: `main-focus:${effectiveDate}`,
    label: 'Complete one A/S Focus Session for at least 25 minutes',
    progress,
    percent: progress * 100,
    completed: progress >= 1,
    completionSourceSessionId: settlement.sourceId,
    taskId: actionTarget.taskId,
    ctaLabel: actionTarget.label,
    actionTarget,
  };
}

function getLedgerEntries(v2State, ledgerSnapshot) {
  const source = ledgerSnapshot.activeRewards
    ?? ledgerSnapshot.rewards
    ?? ledgerSnapshot.ledger
    ?? ledgerSnapshot.entries
    ?? v2State.rewardLedger
    ?? [];
  return (Array.isArray(source) ? source : []).filter(entry => (
    entry
    && entry.reversed !== true
    && !entry.reversedAt
  ));
}

function resolvePendingReveal(v2State, ledgerSnapshot, entries) {
  const direct = ledgerSnapshot.pendingReveal || ledgerSnapshot.pendingRewardReveal;
  const queue = ledgerSnapshot.pendingRewardReveals
    || v2State.pendingRewardReveals
    || [];
  const reveal = direct || (Array.isArray(queue)
    ? queue.find(entry => entry && entry.consumed !== true && !entry.consumedAt)
    : null);
  if (!reveal) return null;

  const match = reveal.id
    ? entries.find(entry => entry.id === reveal.id)
    : null;
  const relatedEntries = Array.isArray(reveal.rewardIds)
    ? reveal.rewardIds.map(id => entries.find(entry => entry.id === id)).filter(Boolean)
    : match
      ? [match]
      : reveal.sourceId
        ? entries.filter(entry => entry.sourceId === reveal.sourceId)
        : [];

  return {
    ...reveal,
    rewards: Array.isArray(reveal.rewards) ? reveal.rewards : relatedEntries,
  };
}

function toWorldChange(entry) {
  if (!entry) return null;
  return {
    id: entry.id || null,
    sourceId: entry.sourceId || null,
    type: entry.rewardType || entry.type || 'reward',
    key: entry.rewardKey || entry.key || null,
    amount: finite(entry.amount, 0),
    createdAt: entry.createdAt || null,
    metadata: entry.metadata || {},
  };
}

function resolveRecentWorldChange(v2State, ledgerSnapshot, entries, pendingReveal) {
  const explicit = ledgerSnapshot.recentWorldChange || v2State.recentWorldChange;
  if (explicit) return explicit;
  if (pendingReveal?.worldChange) return pendingReveal.worldChange;

  const recentId = ledgerSnapshot.recentWorldChangeEventId
    || v2State.recentWorldChangeEventId;
  if (recentId) return toWorldChange(entries.find(entry => entry.id === recentId));

  const latest = [...entries].sort((left, right) => (
    String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    || String(right.id || '').localeCompare(String(left.id || ''))
  ))[0];
  return toWorldChange(latest);
}

function normalizeHiddenStats(value) {
  return HIDDEN_STAT_KEYS.reduce((stats, key) => {
    stats[key] = Math.max(0, finite(value?.[key], 0));
    return stats;
  }, {});
}

function resolveHiddenStats(v2State, ledgerSnapshot) {
  const aggregate = getAggregate(ledgerSnapshot);
  const direct = ledgerSnapshot.hiddenStats;
  if (direct && typeof direct === 'object') return normalizeHiddenStats(direct);

  const base = normalizeHiddenStats(v2State.hiddenStats);
  const deltas = aggregate.hiddenStats;
  if (!deltas || typeof deltas !== 'object') return base;
  return HIDDEN_STAT_KEYS.reduce((stats, key) => {
    stats[key] = Math.max(0, base[key] + finite(deltas[key], 0));
    return stats;
  }, {});
}

function resolveWallet(v2State, ledgerSnapshot, worldRevision) {
  const economy = v2State.economy || {};
  const wallet = ledgerSnapshot.wallet || {};
  const aggregateGold = getAggregate(ledgerSnapshot).gold;
  const openingGold = Math.max(0, finite(wallet.openingGold, finite(economy.openingGold, 0)));
  const earnedGold = Math.max(0, finite(
    wallet.earnedGold,
    finite(readProgress(aggregateGold), finite(economy.earnedGold, 0))
  ));
  const spentGold = Math.max(0, finite(wallet.spentGold, finite(economy.spentGold, 0)));

  return {
    openingGold,
    earnedGold,
    spentGold,
    balanceGold: Math.max(0, openingGold + earnedGold - spentGold),
    revision: finite(wallet.revision, finite(ledgerSnapshot.revision, worldRevision)),
  };
}

function resolveRelationshipStage(v2State, ledgerSnapshot) {
  const aggregate = getAggregate(ledgerSnapshot);
  const direct = ledgerSnapshot.companion?.relationshipStage
    || ledgerSnapshot.relationshipStage
    || aggregate.relationshipStage;
  if (RELATIONSHIP_STAGES.includes(direct)) return direct;

  const base = RELATIONSHIP_STAGES.includes(v2State.companion?.relationshipStage)
    ? v2State.companion.relationshipStage
    : RELATIONSHIP_STAGES[0];
  const delta = Math.floor(finite(aggregate.relationship, 0));
  return RELATIONSHIP_STAGES[
    clamp(RELATIONSHIP_STAGES.indexOf(base) + delta, 0, RELATIONSHIP_STAGES.length - 1)
  ];
}

function sortRecentSessions(sessions) {
  return (Array.isArray(sessions) ? sessions : [])
    .map((session, index) => ({ session, index }))
    .sort((left, right) => (
      String(right.session?.completedAt || '').localeCompare(String(left.session?.completedAt || ''))
      || String(right.session?.id || '').localeCompare(String(left.session?.id || ''))
      || left.index - right.index
    ))
    .slice(0, 7)
    .map(({ session }) => session);
}

function resolvePlacements(world) {
  const layouts = world.idleWindowLayouts && typeof world.idleWindowLayouts === 'object'
    ? Object.values(world.idleWindowLayouts)
    : [];
  const layoutPlacements = layouts.find(layout => (
    layout?.placements && typeof layout.placements === 'object'
  ))?.placements || {};
  const placedItems = Array.isArray(world.placedItems) ? world.placedItems : [];

  return placedItems.reduce((placements, item) => {
    const id = item?.id || item?.layoutItemId || item?.itemId;
    if (!id) return placements;
    placements[id] = item.placement && typeof item.placement === 'object'
      ? item.placement
      : item;
    return placements;
  }, { ...layoutPlacements });
}

function formatRecentWorldChange(change) {
  if (!change) return null;
  if (typeof change === 'string') return change;
  if (change.label || change.message) return change.label || change.message;
  const subject = change.key || change.type || 'World';
  const amount = finite(change.amount, 0);
  return amount ? `${subject} +${amount}` : subject;
}

export function selectProtagonistState({ pendingReveal, recentSessions, momentum } = {}) {
  const reveal = pendingReveal ? JSON.stringify(pendingReveal).toLowerCase() : '';
  if (reveal.includes('project') || reveal.includes('quest') || reveal.includes('world_unlock')) {
    return immutable({ state: 'celebrate', animationKey: 'celebrate', reasonKey: 'reward-progress' });
  }
  if (pendingReveal) {
    return immutable({ state: 'inspect', animationKey: 'inspect', reasonKey: 'reward-pending' });
  }

  const latest = recentSessions?.find(session => session?.result !== 'invalid');
  if (latest?.impactType === 'recovery') {
    return immutable({ state: 'rest', animationKey: 'rest', reasonKey: 'recent-recovery' });
  }
  if (momentum?.state === 'strong' || momentum?.state === 'peak') {
    return immutable({ state: 'work', animationKey: 'work', reasonKey: 'momentum' });
  }
  return immutable({ state: 'idle', animationKey: 'idle', reasonKey: 'ready' });
}

function normalizeBuildArguments(coreOrInput, v2Arg, ledgerArg, optionsArg) {
  if (coreOrInput && typeof coreOrInput === 'object'
      && ('coreState' in coreOrInput || 'v2State' in coreOrInput || 'personalSpaceState' in coreOrInput)) {
    return {
      coreState: coreOrInput.coreState || {},
      v2State: coreOrInput.v2State || coreOrInput.personalSpaceState || {},
      ledgerSnapshot: coreOrInput.ledgerSnapshot || {},
      options: {
        ...(coreOrInput.options || {}),
        ...(coreOrInput.now !== undefined ? { now: coreOrInput.now } : {}),
        ...(coreOrInput.effectiveDate ? { effectiveDate: coreOrInput.effectiveDate } : {}),
      },
    };
  }
  return {
    coreState: coreOrInput || {},
    v2State: v2Arg || {},
    ledgerSnapshot: ledgerArg || {},
    options: optionsArg || {},
  };
}

/** Build the single read-only world snapshot consumed by every render mode. */
export function buildPersonalSpaceV2Snapshot(coreOrInput = {}, v2Arg = {}, ledgerArg = {}, optionsArg = {}) {
  const { coreState, v2State, ledgerSnapshot, options } = normalizeBuildArguments(
    coreOrInput,
    v2Arg,
    ledgerArg,
    optionsArg
  );
  const effectiveDate = resolveEffectiveDate(coreState, options);
  const sessions = Array.isArray(coreState.sessions) ? coreState.sessions : [];
  const recentSessions = sortRecentSessions(
    sessions.filter(session => session?.date === effectiveDate)
  );
  const entries = getLedgerEntries(v2State, ledgerSnapshot);
  const activeProject = resolveActiveProject(v2State, ledgerSnapshot);
  const mainQuest = resolveMainQuest(coreState, ledgerSnapshot, entries, effectiveDate);
  const momentum = deriveMomentum(sessions);
  const pendingReveal = resolvePendingReveal(v2State, ledgerSnapshot, entries);
  const recentWorldChange = resolveRecentWorldChange(
    v2State,
    ledgerSnapshot,
    entries,
    pendingReveal
  );
  const revisionValues = [v2State.worldRevision, ledgerSnapshot.worldRevision, ledgerSnapshot.revision]
    .filter(Number.isFinite);
  const worldRevision = revisionValues.length ? Math.max(...revisionValues) : 0;
  const relationshipStage = resolveRelationshipStage(v2State, ledgerSnapshot);
  const companion = {
    relationshipStage,
    ...getCompanionReaction({
      recentSessions,
      dailyStats: momentum.dailyStats[0] || null,
      hiddenStats: v2State.hiddenStats,
      currentStreak: coreState.user?.streakDays || 0,
      momentum,
      missedPatterns: coreState.missedPatterns,
      activeProject,
      relationshipStage,
      pendingReveal,
    }),
  };
  const protagonist = selectProtagonistState({ pendingReveal, recentSessions, momentum });
  const world = v2State.world || {};
  const user = coreState.user || {};
  const level = getLevelInfo(user.totalXP || 0);
  const suppliedNow = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());

  return immutable({
    snapshotVersion: 1,
    worldRevision,
    effectiveDate,
    sceneId: world.memoryViewSceneId || world.selectedSceneId || 'rough-room',
    sceneStage: activeProject.currentPhase,
    selectedThemeId: world.selectedThemeId || 'default',
    activeProject,
    mainQuest,
    wallet: resolveWallet(v2State, ledgerSnapshot, worldRevision),
    hiddenStats: resolveHiddenStats(v2State, ledgerSnapshot),
    pendingReveal,
    recentWorldChange,
    momentum,
    protagonist,
    playerState: protagonist.state,
    companion,
    companionState: companion.state,
    relationshipStage,
    timeBand: getTimeBand(suppliedNow),
    weather: getWeather(v2State.weather || world.weather),
    player: {
      id: user.id || null,
      name: user.name || null,
      avatar: user.avatar || null,
      level,
      currentStreak: user.streakDays || 0,
    },
    placements: resolvePlacements(world),
    placedItems: world.placedItems || [],
    layoutOverrides: world.idleWindowLayouts || {},
    ownedItems: v2State.inventory?.ownedItems || [],
  });
}

function commonProjection(snapshot, renderMode) {
  return {
    renderMode,
    worldRevision: snapshot.worldRevision,
    walletRevision: snapshot.wallet.revision,
    effectiveDate: snapshot.effectiveDate,
    sceneId: snapshot.sceneId,
    sceneStage: snapshot.sceneStage,
    selectedThemeId: snapshot.selectedThemeId,
    player: snapshot.player,
    playerState: snapshot.playerState,
    protagonist: snapshot.protagonist,
    companionState: snapshot.companionState,
    companion: snapshot.companion,
    relationshipStage: snapshot.relationshipStage,
    activeProject: snapshot.activeProject,
    mainQuest: snapshot.mainQuest,
    wallet: snapshot.wallet,
    hiddenStats: snapshot.hiddenStats,
    recentWorldChange: formatRecentWorldChange(snapshot.recentWorldChange),
    recentWorldChangeEvent: snapshot.recentWorldChange,
    pendingReveal: snapshot.pendingReveal,
    momentum: snapshot.momentum.state,
    momentumDetail: snapshot.momentum,
    timeBand: snapshot.timeBand,
    weather: snapshot.weather,
    placements: snapshot.placements,
    layoutOverrides: snapshot.layoutOverrides,
  };
}

function buildInteractables(snapshot, renderMode) {
  const shared = [
    { id: 'active-project', action: 'open-project', enabled: true },
    {
      id: 'main-quest',
      action: snapshot.mainQuest.actionTarget.kind,
      taskId: snapshot.mainQuest.actionTarget.taskId,
      enabled: true,
    },
    { id: 'companion', action: 'open-companion', enabled: true },
  ];
  if (snapshot.pendingReveal) {
    shared.push({ id: 'pending-reveal', action: 'present-reveal', enabled: true });
  }
  if (renderMode === PERSONAL_SPACE_V2_RENDER_MODES.HOME_WINDOW) {
    shared.push({ id: 'open-full-world', action: 'navigate-personal-space', enabled: true });
  }
  if (renderMode === PERSONAL_SPACE_V2_RENDER_MODES.FULL_WORLD) {
    shared.push({ id: 'open-edit', action: 'enter-edit', enabled: true });
  }
  if (renderMode === PERSONAL_SPACE_V2_RENDER_MODES.EDIT) {
    return [{ id: 'exit-edit', action: 'exit-edit', enabled: true }];
  }
  return shared;
}

export function buildPersonalSpaceV2ViewModel(snapshot, { renderMode = 'home-window' } = {}) {
  const mode = Object.values(PERSONAL_SPACE_V2_RENDER_MODES).includes(renderMode)
    ? renderMode
    : PERSONAL_SPACE_V2_RENDER_MODES.HOME_WINDOW;
  const common = commonProjection(snapshot, mode);
  const interactables = buildInteractables(snapshot, mode);

  if (mode === PERSONAL_SPACE_V2_RENDER_MODES.HOME_WINDOW) {
    return immutable({
      ...common,
      surface: 'orbit-window',
      aspectRatio: '3:2',
      interactables,
      revealPlaybackEnabled: true,
      canEdit: false,
    });
  }

  if (mode === PERSONAL_SPACE_V2_RENDER_MODES.FULL_WORLD) {
    return immutable({
      ...common,
      surface: 'personal-space-world',
      aspectRatio: '3:2',
      interactables,
      revealPlaybackEnabled: true,
      canEdit: true,
      inventorySummary: { ownedCount: snapshot.ownedItems.length },
    });
  }

  return immutable({
    ...common,
    surface: 'personal-space-editor',
    aspectRatio: '3:2',
    interactables,
    revealPlaybackEnabled: false,
    canEdit: true,
    inventory: { ownedItems: snapshot.ownedItems },
    editor: {
      placements: snapshot.placements,
      placedItems: snapshot.placedItems,
      layoutOverrides: snapshot.layoutOverrides,
      awardsRewards: false,
    },
  });
}

function snapshotFrom(value) {
  return value?.snapshotVersion === 1 ? value : buildPersonalSpaceV2Snapshot(value);
}

export function buildHomeWindowViewModel(snapshotOrInput) {
  return buildPersonalSpaceV2ViewModel(snapshotFrom(snapshotOrInput), {
    renderMode: PERSONAL_SPACE_V2_RENDER_MODES.HOME_WINDOW,
  });
}

export function buildFullWorldViewModel(snapshotOrInput) {
  return buildPersonalSpaceV2ViewModel(snapshotFrom(snapshotOrInput), {
    renderMode: PERSONAL_SPACE_V2_RENDER_MODES.FULL_WORLD,
  });
}

export function buildEditViewModel(snapshotOrInput) {
  return buildPersonalSpaceV2ViewModel(snapshotFrom(snapshotOrInput), {
    renderMode: PERSONAL_SPACE_V2_RENDER_MODES.EDIT,
  });
}
