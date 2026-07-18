// Session settlement core: instant completion, focus-session submission,
// shared commit (XP / energy persistence + UI feedback + level-up), and
// session deletion (reverse settlement). Moved from app.js — the session
// assembly, B-class daily cap, and proof-sheet trigger that were duplicated
// between the instant and focus paths are consolidated here. The XP/energy
// calculation lines stay explicit per path because their rules differ.

import { state } from './state.js';
import { storage, db } from './storage.js';
import {
  calcBaseXP, calcFinalXP, calcEnergyCost, calcEnergyGain,
  getDailyTaskXP, getDailyTaskCount, getMinEffectiveMinutes, calcTimeMultiplier,
} from './engine.js';
import { getLevelInfo, getDisplayTitle } from './leveling.js';
import { uid } from './utils.js';
import { eToday } from './dayCycle.js';
import { renderPage, currentHash } from './router.js';
import { showToast, showXPFloat, showLevelUp } from './ui/feedback.js';
import { updateHeader } from './ui/header.js';
import { showProofSheet } from './ui/proofSheet.js';
import { haptic } from './platform/haptics.js';
import {
  clearSessionDeletion,
  recordSessionDeletion,
  recordSessionDeletionAttempt,
  recordSessionDeletionLocalSettled,
  recordSessionDeletionRemoteConfirmed,
} from './platform/sessionDeletionLog.js';
import { isPersonalSpaceV2Enabled } from './personalSpace/v2/featureFlag.js';
import { reconcileAndSavePersonalSpaceV2 } from './personalSpace/v2/controller.js';

// Badge updates are injected by app.js (the badge module is warm-loaded there).
// Before injection this is a no-op — same as the pre-warm-load behavior.
let _updateBadge = () => {};
export function setBadgeUpdater(fn) { _updateBadge = fn; }

export function reconcilePersonalSpaceAfterSessionChange(options = {}) {
  if (!state.user || !isPersonalSpaceV2Enabled()) return null;
  try {
    return reconcileAndSavePersonalSpaceV2({
      user: state.user,
      sessions: state.sessions,
      queueReveal: true,
      deletedSourceIds: options.deletedSourceIds || [],
      reconciledAt: options.reconciledAt,
    });
  } catch (error) {
    console.warn('Personal Space V2 reconciliation will retry on the next render.', error);
    return null;
  }
}

export function getTodayEntertainmentMinutes() {
  const todayStr = eToday();
  return state.sessions
    .filter(s => s.date === todayStr && s.impactType === 'entertainment')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
}

// ─── Shared settlement pieces ────────────────────────────────────────────────

/** B-class daily XP cap (default 100/day, overridable per task). */
function applyDailyCap(task, finalXP, todayStr) {
  if (task.value !== 'B') return finalXP;
  const alreadyToday = getDailyTaskXP(state.sessions, task.id, todayStr);
  const taskCap = task.dailyXpCap ?? 100;
  if (alreadyToday >= taskCap) return 0;
  return Math.min(finalXP, taskCap - alreadyToday);
}

/** Assemble the session record — single source for the field list. */
function buildSession(task, {
  todayStr, result, durationMinutes, startedAt, completedAt,
  baseXP, finalXP, energyCost, energyGain, note = '',
}) {
  const isProductiveXP = task.impactType === 'task' &&
    task.value !== 'D' && finalXP > 0 && result !== 'invalid';
  return {
    id:              uid(),
    taskId:          task.id,
    taskName:        task.name,
    taskEmoji:       task.emoji || '🎯',
    taskIconImg:     task.iconImg || null,
    date:            todayStr,
    startedAt,
    completedAt,
    durationMinutes,
    result,
    baseXP,
    finalXP,
    energyCost,
    energyGain,
    streakMultiplier: 1,
    impactType:      task.impactType,
    taskNature:      task.taskNature,
    value:           task.value,
    resistance:      task.resistance,
    isProductiveXP,
    ...(note ? { note } : {}),
  };
}

function offerProofSheet(session, task) {
  // Inline capability check avoids importing proofCapture.js at startup
  if (typeof window !== 'undefined' && typeof FileReader !== 'undefined') {
    setTimeout(() => showProofSheet(session.id, task.name), 700);
  }
}

// ─── Instant task completion ─────────────────────────────────────────────────

window.completeInstant = function (taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !state.user) return;

  const todayStr = eToday();

  // Anti-grind: max 3 completions per task per day
  if (getDailyTaskCount(state.sessions, taskId, todayStr) >= 3) {
    showToast('今日此任務已達上限（3次）');
    return;
  }

  const baseXP     = calcBaseXP(task);
  const finalXP    = applyDailyCap(task,
    calcFinalXP(baseXP, 'instant', state.user.streakDays || 0), todayStr);
  const energyCost = calcEnergyCost(task);
  // Energy: recovery/entertainment gain energy instead of costing.
  // For instant recovery/entertainment we use a flat 15-min bracket.
  const energyGain = task.impactType !== 'task'
    ? calcEnergyGain(task, 15, getTodayEntertainmentMinutes())
    : 0;

  const now = new Date().toISOString();
  const session = buildSession(task, {
    todayStr, result: 'instant', durationMinutes: 0,
    startedAt: now, completedAt: now,
    baseXP, finalXP, energyCost, energyGain,
  });

  commitSession(session);
  offerProofSheet(session, task);
};

// ─── Focus session submission ────────────────────────────────────────────────

/** Settle a finished (or aborted) focus session. Focus-timer teardown stays with the timer. */
export function submitFocusResult(taskId, elapsedSec, result, durationMin, note = '') {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !state.user) return;

  const todayStr = eToday();
  const baseXP   = calcBaseXP(task);
  let   finalXP  = calcFinalXP(baseXP, result, state.user.streakDays || 0);

  // Time multiplier: XP scales linearly with session duration (focus tasks only, capped at 4x)
  if (result !== 'invalid' && task.impactType === 'task') {
    const timeMult = calcTimeMultiplier(durationMin, getMinEffectiveMinutes(task.difficulty));
    finalXP = Math.round(finalXP * timeMult);
  }
  finalXP = applyDailyCap(task, finalXP, todayStr);

  const energyCost = result !== 'invalid' ? calcEnergyCost(task) : 0;
  const energyGain = task.impactType !== 'task'
    ? calcEnergyGain(task, durationMin, getTodayEntertainmentMinutes())
    : 0;

  const session = buildSession(task, {
    todayStr, result, durationMinutes: durationMin,
    startedAt:   new Date(Date.now() - elapsedSec * 1000).toISOString(),
    completedAt: new Date().toISOString(),
    baseXP, finalXP, energyCost, energyGain, note,
  });

  commitSession(session);
  // Show proof sheet for completed/partial timed sessions; not for invalid (unproductive)
  if (result !== 'invalid') offerProofSheet(session, task);
}

// ─── Shared session commit ────────────────────────────────────────────────────

export function commitSession(session) {
  if (!session?.id || state.sessions.some(existing => existing.id === session.id)) {
    return false;
  }
  const oldLevel = getLevelInfo(state.user.totalXP || 0).level;

  const energyBefore = Number.isFinite(state.energy.currentEnergy)
    ? state.energy.currentEnergy
    : 0;
  const maxEnergy = Number.isFinite(state.energy.maxEnergy)
    ? Math.max(0, state.energy.maxEnergy)
    : 100;
  let energyAfter = energyBefore;
  if (session.energyCost > 0) {
    energyAfter = Math.max(0, energyAfter - session.energyCost);
  }
  if (session.energyGain > 0) {
    energyAfter = Math.min(maxEnergy, energyAfter + session.energyGain);
  }
  // Local-only settlement metadata makes undo exact at clamp boundaries. It is
  // preserved by the local merge and intentionally omitted from DB field maps.
  session._energyDeltaApplied = energyAfter - energyBefore;

  // Persist session
  state.sessions.push(session);
  storage.saveSessions(state.sessions);

  // Update XP
  state.user.totalXP = (state.user.totalXP || 0) + session.finalXP;

  // Update energy
  state.energy.currentEnergy = energyAfter;
  storage.saveEnergy(state.energy);
  storage.saveUser(state.user);
  reconcilePersonalSpaceAfterSessionChange();

  updateHeader();

  const xpLabel = session.finalXP > 0
    ? `+${session.finalXP} XP`
    : session.impactType === 'recovery'
      ? `+${session.energyGain} ⚡`
      : session.result === 'invalid'
        ? '無效 0 XP'
        : '完成';
  showXPFloat(xpLabel);
  haptic(session.result === 'invalid' ? 'warning' : 'taskComplete');

  renderPage(currentHash());

  const newLevel = getLevelInfo(state.user.totalXP).level;
  if (newLevel > oldLevel) {
    setTimeout(() => {
      haptic('levelUp');
      showLevelUp(newLevel, getDisplayTitle(newLevel, state.user));
    }, 600);
  }
  _updateBadge();
  return true;
}

// ─── Delete (reverse settlement) ─────────────────────────────────────────────

window.deleteSession = function (sessionId) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  if (!confirm(`撤銷「${session.taskName}」這筆記錄？`)) return;

  const ownerId = state.user?.id;
  const deletedAt = new Date().toISOString();
  const targetTotalXP = Math.max(
    0,
    (state.user.totalXP || 0) - (Number.isFinite(session.finalXP) ? session.finalXP : 0),
  );
  let targetEnergyCurrent = state.energy.currentEnergy;
  if (Number.isFinite(session._energyDeltaApplied)) {
    targetEnergyCurrent = Math.min(
      state.energy.maxEnergy,
      Math.max(0, state.energy.currentEnergy - session._energyDeltaApplied),
    );
  } else {
    // Compatibility fallback for Sessions created before exact local deltas.
    if (session.energyCost > 0) {
      targetEnergyCurrent = Math.min(
        state.energy.maxEnergy,
        targetEnergyCurrent + session.energyCost,
      );
    }
    if (session.energyGain > 0) {
      targetEnergyCurrent = Math.max(0, targetEnergyCurrent - session.energyGain);
    }
  }
  if (ownerId) {
    try {
      recordSessionDeletion(ownerId, sessionId, deletedAt, {
        targetTotalXP,
        targetEnergyCurrent,
      });
    } catch (error) {
      console.warn('Session undo was stopped because its deletion log could not be saved.', error);
      showToast('無法安全撤銷，請確認儲存空間後再試');
      return false;
    }
  }

  // Reverse XP
  state.user.totalXP = targetTotalXP;

  // Reverse energy
  state.energy.currentEnergy = targetEnergyCurrent;

  // Remove session
  state.sessions = state.sessions.filter(s => s.id !== sessionId);
  storage.saveSessions(state.sessions);
  storage.saveUser(state.user);
  storage.saveEnergy(state.energy);
  if (ownerId) {
    try {
      recordSessionDeletionLocalSettled(ownerId, sessionId, deletedAt);
    } catch (error) {
      console.warn('Session deletion recovery checkpoint could not be updated.', error);
    }
  }
  const v2Enabled = isPersonalSpaceV2Enabled();
  const v2Result = reconcilePersonalSpaceAfterSessionChange({
    deletedSourceIds: [sessionId],
    reconciledAt: deletedAt,
  });
  const worldSettled = !v2Enabled || Boolean(v2Result?.persisted);

  // Keep the local deletion tombstone until Supabase confirms the row is gone.
  if (ownerId) {
    try {
      recordSessionDeletionAttempt(ownerId, sessionId, deletedAt);
    } catch (error) {
      console.warn('Session deletion retry metadata could not be updated.', error);
    }
  }
  db.deleteSession(sessionId, ownerId)
    .then(confirmed => {
      if (!confirmed || !ownerId) return;
      const confirmedAt = new Date().toISOString();
      if (worldSettled) {
        clearSessionDeletion(ownerId, sessionId);
      } else {
        recordSessionDeletionRemoteConfirmed(ownerId, sessionId, confirmedAt);
      }
    })
    .catch(console.error);

  updateHeader();
  renderPage(currentHash());
  showToast('已撤銷');
  _updateBadge();
  return true;
};
