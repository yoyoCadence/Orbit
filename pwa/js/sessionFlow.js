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

// Badge updates are injected by app.js (the badge module is warm-loaded there).
// Before injection this is a no-op — same as the pre-warm-load behavior.
let _updateBadge = () => {};
export function setBadgeUpdater(fn) { _updateBadge = fn; }

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
  const oldLevel = getLevelInfo(state.user.totalXP || 0).level;

  // Persist session
  state.sessions.push(session);
  storage.saveSessions(state.sessions);

  // Update XP
  state.user.totalXP = (state.user.totalXP || 0) + session.finalXP;

  // Update energy
  if (session.energyCost > 0) {
    state.energy.currentEnergy = Math.max(0,
      state.energy.currentEnergy - session.energyCost);
  }
  if (session.energyGain > 0) {
    state.energy.currentEnergy = Math.min(state.energy.maxEnergy,
      state.energy.currentEnergy + session.energyGain);
  }
  storage.saveEnergy(state.energy);
  storage.saveUser(state.user);

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
}

// ─── Delete (reverse settlement) ─────────────────────────────────────────────

window.deleteSession = function (sessionId) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  if (!confirm(`撤銷「${session.taskName}」這筆記錄？`)) return;

  // Reverse XP
  state.user.totalXP = Math.max(0, (state.user.totalXP || 0) - session.finalXP);

  // Reverse energy
  if (session.energyCost > 0) {
    state.energy.currentEnergy = Math.min(state.energy.maxEnergy,
      state.energy.currentEnergy + session.energyCost);
  }
  if (session.energyGain > 0) {
    state.energy.currentEnergy = Math.max(0,
      state.energy.currentEnergy - session.energyGain);
  }

  // Remove session
  state.sessions = state.sessions.filter(s => s.id !== sessionId);
  storage.saveSessions(state.sessions);
  storage.saveUser(state.user);
  storage.saveEnergy(state.energy);

  // Delete from Supabase
  db.deleteSession(sessionId).catch(console.error);

  updateHeader();
  renderPage(currentHash());
  showToast('已撤銷');
  _updateBadge();
};
