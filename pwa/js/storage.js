// Data persistence abstraction layer
// Sync reads/writes → localStorage (always available, used as cache)
// Async background sync → Supabase (when authenticated + online)

import { supabase }  from './supabase.js';
import { today, mergeSessionsById } from './utils.js';
import { FLAG_DEV_BACKUP } from './flags.js';
import {
  applyProStatusResponse,
  clearProEntitlementSnapshot,
  getPaidProStateFromSnapshot,
  getTrialEndsAtFromSnapshot,
  isProFromSnapshot,
  isServerProEntitlementEnabled,
} from './platform/proEntitlement.js';
import {
  filterDeletedSessions,
  loadSessionDeletionLog,
  recordSessionDeletionAttempt,
  recordSessionDeletionLocalSettled,
  recordSessionDeletionRemoteConfirmed,
} from './platform/sessionDeletionLog.js';

const PREFIX = 'yoyo_';
const LEADERBOARD_CACHE_KEY = 'leaderboardCache';
const PROFILE_SYNC_PENDING_KEY = 'profileSyncPending';
const ENERGY_SYNC_PENDING_KEY = 'energySyncPending';
const SESSION_SYNC_PENDING_KEY = 'sessionSyncPending';
const TASK_SYNC_PENDING_KEY = 'taskSyncPending';
const SESSION_SYNC_CUTOVER_KEY = 'sessionSyncCutover:v1.21';

// Mirrors pro_trial_duration() in pwa/db/011_leaderboard_pro.sql. Only the
// `legacy` source needs it — under `server` the trial end comes from the
// projection, so this copy disappears with the legacy path at PRO-014H.
const TRIAL_DURATION_MS = 15 * 24 * 60 * 60 * 1000;

function get(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}
/**
 * Writes to localStorage and reports success instead of throwing.
 *
 * BUG-105: a QuotaExceededError（配額用盡 / Safari 隱私模式）used to propagate
 * into whatever UI handler triggered the write. The morning modal's click
 * handler had no try/catch, so the throw skipped `modal.remove()` and left the
 * user permanently stuck on a modal with no close button. Callers that need to
 * tell the user something went wrong check the return value.
 */
function set(key, val) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
    return true;
  } catch (err) {
    console.error(`localStorage write failed for "${key}":`, err);
    return false;
  }
}

function remove(key) {
  localStorage.removeItem(PREFIX + key);
}

function createPendingSnapshot(ownerId, value) {
  return {
    ownerId,
    value: { ...value },
  };
}

function clearPendingSnapshot(key, expected) {
  const current = get(key);
  if (JSON.stringify(current) === JSON.stringify(expected)) remove(key);
}

function ownerSyncPendingKey(baseKey, ownerId) {
  if (!ownerId) return null;
  return `${baseKey}:${encodeURIComponent(String(ownerId))}`;
}

function hasCompletedSessionSyncCutover(ownerId) {
  const marker = get(ownerSyncPendingKey(SESSION_SYNC_CUTOVER_KEY, ownerId));
  return marker?.ownerId === ownerId && marker?.completed === true;
}

function completeSessionSyncCutover(ownerId, completedAt = new Date().toISOString()) {
  set(ownerSyncPendingKey(SESSION_SYNC_CUTOVER_KEY, ownerId), {
    ownerId,
    completed: true,
    completedAt,
  });
}

function loadOwnerPendingSessions(ownerId) {
  const snapshot = get(ownerSyncPendingKey(SESSION_SYNC_PENDING_KEY, ownerId));
  if (snapshot?.ownerId !== ownerId || !Array.isArray(snapshot.value)) return [];
  return snapshot.value
    .filter(session => session?.id)
    .map(session => ({ ...session, _syncPending: true }));
}

function saveOwnerPendingSessions(ownerId, sessions) {
  const key = ownerSyncPendingKey(SESSION_SYNC_PENDING_KEY, ownerId);
  if (!key) return;
  const byId = new Map((Array.isArray(sessions) ? sessions : [])
    .filter(session => session?.id)
    .map(session => [session.id, { ...session, _syncPending: true }]));
  if (!byId.size) {
    remove(key);
    return;
  }
  set(key, { ownerId, value: [...byId.values()] });
}

function addOwnerPendingSession(ownerId, session) {
  if (!ownerId || !session?.id) return;
  const pending = loadOwnerPendingSessions(ownerId)
    .filter(candidate => candidate.id !== session.id);
  saveOwnerPendingSessions(ownerId, [...pending, session]);
}

function clearOwnerPendingSession(ownerId, sessionId) {
  if (!ownerId || !sessionId) return;
  saveOwnerPendingSessions(
    ownerId,
    loadOwnerPendingSessions(ownerId).filter(session => session.id !== sessionId),
  );
}

/**
 * Trims a task down to the fields `upsertTasks` actually writes. The pending
 * sidecar exists purely to retry the remote write, and a full copy would
 * double the localStorage cost of inline `iconImg` data URLs.
 */
function syncableTask(task) {
  const slim = {};
  for (const [jsKey, , , write] of TASK_FIELDS) {
    if (write) slim[jsKey] = task?.[jsKey];
  }
  return slim;
}

/**
 * Records the task list as not-yet-confirmed-remote and returns the stored
 * snapshot (re-read so `clearPendingSnapshot` compares like for like).
 * Returns null when there is no owner or the write did not land.
 *
 * `deletedIds` are tombstones: a task list alone cannot express "delete this
 * remotely", so an offline delete would be undone by the next canonical pull
 * (and `saveTasks([])` — delete everything — would resurrect the whole list).
 * Tombstones accumulate across saves until the remote delete is confirmed.
 */
function saveOwnerPendingTasks(ownerId, tasks, removedIds = []) {
  const key = ownerSyncPendingKey(TASK_SYNC_PENDING_KEY, ownerId);
  if (!key) return null;
  const list = Array.isArray(tasks) ? tasks : [];
  const liveIds = new Set(list.map(task => task?.id).filter(Boolean));
  const { snapshot: previous } = loadOwnerPendingSnapshot(TASK_SYNC_PENDING_KEY, ownerId);
  const carried = previous?.ownerId === ownerId && Array.isArray(previous.deletedIds)
    ? previous.deletedIds
    : [];
  const snapshot = {
    ownerId,
    value: list.map(syncableTask),
    // A task present locally again is no longer a tombstone.
    deletedIds: [...new Set([...carried, ...(removedIds ?? [])])]
      .filter(id => id && !liveIds.has(id)),
  };
  if (!set(key, snapshot)) return null;
  return get(key);
}

function loadOwnerPendingSnapshot(baseKey, ownerId) {
  const key = ownerSyncPendingKey(baseKey, ownerId);
  if (!key) return { key: null, snapshot: null };

  const scoped = get(key);
  if (scoped?.ownerId === ownerId) return { key, snapshot: scoped };

  // v1.21 pre-release builds used one global sidecar per data type. Migrate it
  // only for its recorded owner so another account can never claim it.
  const legacy = get(baseKey);
  if (legacy?.ownerId === ownerId) {
    set(key, legacy);
    clearPendingSnapshot(baseKey, legacy);
    return { key, snapshot: legacy };
  }

  return { key, snapshot: null };
}

function isCachedOwner(expectedOwnerId) {
  return Boolean(expectedOwnerId && get('user')?.id === expectedOwnerId);
}

function markSessionSyncPending(sessionOrId, expectedOwnerId) {
  const sessionId = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId?.id;
  if (!sessionId) return;
  const sessions = get('sessions') ?? [];
  const idx = sessions.findIndex(s => s?.id === sessionId);
  const pendingSession = typeof sessionOrId === 'object' ? sessionOrId : sessions[idx];
  if (pendingSession) addOwnerPendingSession(expectedOwnerId, pendingSession);
  if (!isCachedOwner(expectedOwnerId)) return;
  if (idx === -1) return;
  sessions[idx] = { ...sessions[idx], _syncPending: true };
  set('sessions', sessions);
}

function clearSessionSyncPending(sessionId, expectedOwnerId) {
  clearOwnerPendingSession(expectedOwnerId, sessionId);
  if (!isCachedOwner(expectedOwnerId)) return;
  const sessions = get('sessions') ?? [];
  const idx = sessions.findIndex(s => s?.id === sessionId);
  if (idx === -1 || sessions[idx]._syncPending !== true) return;
  const syncedSession = { ...sessions[idx] };
  delete syncedSession._syncPending;
  sessions[idx] = syncedSession;
  set('sessions', sessions);
}

function legacyUndoEnergyTarget(session, energy) {
  const maxEnergy = Number.isFinite(energy.maxEnergy) ? energy.maxEnergy : 100;
  let current = Number.isFinite(energy.currentEnergy) ? energy.currentEnergy : maxEnergy;
  if (Number.isFinite(session?._energyDeltaApplied)) {
    return Math.min(maxEnergy, Math.max(0, current - session._energyDeltaApplied));
  }
  if (session?.energyCost > 0) current = Math.min(maxEnergy, current + session.energyCost);
  if (session?.energyGain > 0) current = Math.max(0, current - session.energyGain);
  return current;
}

/**
 * Finish an undo interrupted after its durable deletion journal was written.
 * Journal targets make the user/Energy writes idempotent across partial local
 * persistence; settled entries only filter a resurfaced Session.
 */
export function recoverPendingSessionDeletions(ownerId, recoveredAt = new Date().toISOString()) {
  if (!isCachedOwner(ownerId)) return { recoveredIds: [], settledIds: [] };
  const entries = loadSessionDeletionLog(ownerId);
  const entryList = Object.values(entries);
  if (!entryList.length) return { recoveredIds: [], settledIds: [] };

  let sessions = get('sessions') ?? [];
  const user = get('user');
  const energy = get('energy') ?? { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' };
  const recoveredIds = [];
  const unsettledEntries = entryList.filter(entry => !entry.localSettledAt);

  for (const entry of entryList) {
    const session = sessions.find(candidate => candidate?.id === entry.sessionId);
    if (!entry.localSettledAt) {
      const targetTotalXP = entry.recovery?.targetTotalXP;
      const targetEnergyCurrent = entry.recovery?.targetEnergyCurrent;
      if (user && Number.isFinite(targetTotalXP)) user.totalXP = targetTotalXP;
      else if (user && session) {
        user.totalXP = Math.max(0, (user.totalXP || 0) - (session.finalXP || 0));
      }
      if (Number.isFinite(targetEnergyCurrent)) energy.currentEnergy = Math.min(
        energy.maxEnergy,
        Math.max(0, targetEnergyCurrent),
      );
      else if (session) energy.currentEnergy = legacyUndoEnergyTarget(session, energy);
      recoveredIds.push(entry.sessionId);
    }
    sessions = sessions.filter(candidate => candidate?.id !== entry.sessionId);
  }

  // Complete all canonical writes before checkpointing the journal. A thrown
  // localStorage write leaves entries unsettled so the same targets replay.
  set('sessions', sessions);
  if (user) set('user', user);
  set('energy', energy);
  if (unsettledEntries.length) {
    if (user) {
      set(
        ownerSyncPendingKey(PROFILE_SYNC_PENDING_KEY, ownerId),
        createPendingSnapshot(ownerId, user),
      );
    }
    set(
      ownerSyncPendingKey(ENERGY_SYNC_PENDING_KEY, ownerId),
      createPendingSnapshot(ownerId, energy),
    );
  }
  unsettledEntries.forEach(entry => {
    recordSessionDeletionLocalSettled(ownerId, entry.sessionId, recoveredAt);
  });

  return {
    recoveredIds,
    settledIds: unsettledEntries.map(entry => entry.sessionId),
  };
}

// ─── Field maps: snake_case DB row ↔ camelCase JS object ─────────────────────
//
// Each entry: [jsKey, dbKey, fromRow(row), toRow(obj)]
// fromRow/toRow carry the per-field default semantics（`||` 與 `??` 刻意不同，
// 例如 last_streak_date 讀 null→'' 但寫 ''→null）verbatim — locked by
// tests/unit/storage-mapping.test.js. Adding a synced field = one new row here
// (+ DB migration). toRow = null marks read-only fields never written back.

const PROFILE_FIELDS = [
  ['name',                   'name',                      p => p.name,                              u => u.name],
  ['totalXP',                'total_xp',                  p => p.total_xp,                          u => u.totalXP              || 0],
  ['streakDays',             'streak_days',               p => p.streak_days,                       u => u.streakDays           || 0],
  ['lastStreakDate',         'last_streak_date',          p => p.last_streak_date         || '',    u => u.lastStreakDate       || null],
  ['lastWeeklyBonusDate',    'last_weekly_bonus_date',    p => p.last_weekly_bonus_date   || '',    u => u.lastWeeklyBonusDate  || null],
  ['morningState',           'morning_state',             p => p.morning_state,                     u => u.morningState         || 'normal'],
  ['mode',                   'mode',                      p => p.mode,                              u => u.mode                 || 'normal'],
  ['isPublic',               'is_public',                 p => p.is_public                ?? false, u => u.isPublic             ?? false],
  ['titleTemplate',          'title_template',            p => p.title_template           || 'rpg', u => u.titleTemplate        || 'rpg'],
  ['customTitle',            'custom_title',              p => p.custom_title             || '',    u => u.customTitle          || null],
  ['newDayHour',             'new_day_hour',              p => p.new_day_hour             ?? 5,     u => u.newDayHour           ?? 5],
  ['isPro',                  'is_pro',                    p => p.is_pro                   ?? false, u => u.isPro                ?? false],
  ['proExpiresAt',           'pro_expires_at',            p => p.pro_expires_at           || null,  u => u.proExpiresAt         ?? null],
  ['trialStartedAt',         'trial_started_at',          p => p.trial_started_at         || null,  u => u.trialStartedAt       ?? null],
  ['streakShieldCount',      'streak_shield_count',       p => p.streak_shield_count      ?? 2,     u => u.streakShieldCount    ?? 2],
  ['streakShieldResetMonth', 'streak_shield_reset_month', p => p.streak_shield_reset_month || '',   u => u.streakShieldResetMonth || ''],
  ['streakUnlockUsed',       'streak_unlock_used',        p => p.streak_unlock_used       ?? false, u => u.streakUnlockUsed     ?? false],
  ['focusDefaultMinutes',    'focus_default_minutes',     p => p.focus_default_minutes    ?? null,  u => u.focusDefaultMinutes  ?? null],
  ['focusSoundEnabled',      'focus_sound_enabled',       p => p.focus_sound_enabled      ?? true,  u => u.focusSoundEnabled    ?? true],
];

const TASK_FIELDS = [
  ['id',                  'id',                    t => t.id,                       t => t.id],
  ['name',                'name',                  t => t.name,                     t => t.name],
  ['category',            'category',              t => t.category,                 t => t.category],
  ['impactType',          'impact_type',           t => t.impact_type,              t => t.impactType],
  ['taskNature',          'task_nature',           t => t.task_nature,              t => t.taskNature],
  ['value',               'value',                 t => t.value,                    t => t.value],
  ['difficulty',          'difficulty',            t => t.difficulty,               t => t.difficulty],
  ['resistance',          'resistance',            t => t.resistance,               t => t.resistance],
  ['emoji',               'emoji',                 t => t.emoji            || null, t => t.emoji               || null],
  ['dailyXpCap',          'daily_xp_cap',          t => t.daily_xp_cap,             t => t.dailyXpCap          ?? 100],
  ['cooldownMinutes',     'cooldown_minutes',      t => t.cooldown_minutes,         t => t.cooldownMinutes     ?? 0],
  ['minEffectiveMinutes', 'min_effective_minutes', t => t.min_effective_minutes,    t => t.minEffectiveMinutes ?? 0],
  ['isDefault',           'is_default',            t => t.is_default,               t => t.isDefault           ?? false],
  ['reason',              'reason',                t => t.reason           || null, t => t.reason              || null],
  ['successCriteria',     'success_criteria',      t => t.success_criteria || null, t => t.successCriteria     || null],
  ['valueConfidence',     'value_confidence',      t => t.value_confidence,         t => t.valueConfidence     ?? 100],
  ['createdAt',           'created_at',            t => t.created_at,               null],
];

const SESSION_FIELDS = [
  ['id',              'id',               s => s.id,                     s => s.id],
  ['taskId',          'task_id',          s => s.task_id      || null,   s => s.taskId    || null],
  ['taskName',        'task_name',        s => s.task_name,              s => s.taskName],
  ['taskEmoji',       'task_emoji',       s => s.task_emoji   || null,   s => s.taskEmoji || null],
  ['date',            'date',             s => s.date,                   s => s.date],
  ['startedAt',       'started_at',       s => s.started_at,             s => s.startedAt],
  ['completedAt',     'completed_at',     s => s.completed_at,           s => s.completedAt],
  ['durationMinutes', 'duration_minutes', s => s.duration_minutes,       s => s.durationMinutes],
  ['result',          'result',           s => s.result,                 s => s.result],
  ['baseXP',          'base_xp',          s => s.base_xp,                s => s.baseXP],
  ['finalXP',         'final_xp',         s => s.final_xp,               s => s.finalXP],
  ['energyCost',      'energy_cost',      s => s.energy_cost,            s => s.energyCost],
  ['energyGain',      'energy_gain',      s => s.energy_gain,            s => s.energyGain],
  ['impactType',      'impact_type',      s => s.impact_type,            s => s.impactType],
  ['taskNature',      'task_nature',      s => s.task_nature,            s => s.taskNature],
  ['value',           'value',            s => s.value,                  s => s.value],
  ['resistance',      'resistance',       s => s.resistance,             s => s.resistance],
  ['isProductiveXP',  'is_productive_xp', s => s.is_productive_xp,       s => s.isProductiveXP],
  ['taskIconImg',     'task_icon_img',    s => s.task_icon_img || null,  null], // 本機圖示不上雲
];

const ENERGY_FIELDS = [
  ['currentEnergy', 'current_energy',  e => e.current_energy,        en => en.currentEnergy],
  ['maxEnergy',     'max_energy',      e => e.max_energy,            en => en.maxEnergy],
  ['lastResetDate', 'last_reset_date', e => e.last_reset_date || '', en => en.lastResetDate || null],
];

/** DB row → JS object（依 fields 表）。 */
function fromRow(fields, row) {
  const obj = {};
  for (const [jsKey, , read] of fields) obj[jsKey] = read(row);
  return obj;
}

/** JS object → DB payload（依 fields 表；toRow 為 null 的欄位不寫回）。 */
function toRow(fields, obj) {
  const row = {};
  for (const [, dbKey, , write] of fields) if (write) row[dbKey] = write(obj);
  return row;
}

// ─── Supabase async operations ────────────────────────────────────────────────

export class OwnerSessionChangedError extends Error {
  constructor(expectedOwnerId, actualOwnerId = null) {
    super(`Authenticated owner changed during sync (expected ${expectedOwnerId}, received ${actualOwnerId || 'none'})`);
    this.name = 'OwnerSessionChangedError';
    this.expectedOwnerId = expectedOwnerId;
    this.actualOwnerId = actualOwnerId;
  }
}

// PRO-014C: start_trial() returns a timestamptz, which PostgREST renders as an
// ISO string. Anything else means the response is not the contract, and a trial
// must not be recorded from a value this client cannot read.
function _normalizeTrialTimestamp(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export const db = {

  async _session() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async _assertOwner(expectedOwnerId) {
    const session = await this._session();
    const actualOwnerId = session?.user?.id || null;
    if (!expectedOwnerId || actualOwnerId !== expectedOwnerId) {
      throw new OwnerSessionChangedError(expectedOwnerId, actualOwnerId);
    }
    return session;
  },

  /** Pull all user data from Supabase → write into localStorage cache. */
  async loadFromRemote(userId) {
    await this._assertOwner(userId);

    // Push any locally pending changes before overwriting with remote data
    const localUser = get('user');
    const {
      key: pendingProfileKey,
      snapshot: pendingProfile,
    } = loadOwnerPendingSnapshot(PROFILE_SYNC_PENDING_KEY, userId);
    const {
      key: pendingEnergyKey,
      snapshot: pendingEnergy,
    } = loadOwnerPendingSnapshot(ENERGY_SYNC_PENDING_KEY, userId);
    const {
      key: pendingTasksKey,
      snapshot: pendingTasks,
    } = loadOwnerPendingSnapshot(TASK_SYNC_PENDING_KEY, userId);
    const sessionDeletionLog = loadSessionDeletionLog(userId);
    const deletedSessionIds = new Set(Object.keys(sessionDeletionLog));
    const cachedSessions = localUser?.id === userId
      ? filterDeletedSessions(get('sessions') ?? [], deletedSessionIds)
      : [];
    const ownerPendingSessions = filterDeletedSessions(
      loadOwnerPendingSessions(userId),
      deletedSessionIds,
    );
    const ownerPendingIds = new Set(ownerPendingSessions.map(session => session.id));
    const localSessions = mergeSessionsById(cachedSessions, ownerPendingSessions)
      .map(session => ownerPendingIds.has(session.id)
        ? { ...session, _syncPending: true }
        : session);
    const pendingProfileValue = pendingProfile?.ownerId === userId
      ? pendingProfile.value
      : localUser?._syncPending && localUser?.id === userId
        ? (() => {
            const userToSync = { ...localUser };
            delete userToSync._syncPending;
            return userToSync;
          })()
        : null;
    if (pendingProfileValue) {
      try {
        const synced = await this.upsertProfile(pendingProfileValue, userId);
        if (!synced) throw new Error('No authenticated profile sync session');
        if (pendingProfile?.ownerId === userId) {
          clearPendingSnapshot(pendingProfileKey, pendingProfile);
        }
      } catch (err) {
        console.warn('Could not push pending local profile before remote load:', err);
        throw err;
      }
    }
    if (pendingEnergy?.ownerId === userId) {
      try {
        const synced = await this.upsertEnergy(pendingEnergy.value, userId);
        if (!synced) throw new Error('No authenticated Energy sync session');
        clearPendingSnapshot(pendingEnergyKey, pendingEnergy);
      } catch (err) {
        console.warn('Could not push pending local Energy before remote load:', err);
        throw err;
      }
    }
    // Tasks have no per-row merge below — `set('tasks', canonicalTasks)` is a
    // straight overwrite. A task the device never managed to upsert (offline,
    // flaky mobile network, rejected write) would therefore disappear on the
    // next launch, which is what "隔天任務就不見了" looked like. The mirror
    // image is just as bad: an unconfirmed delete would let the pull resurrect
    // the task. Replay both halves, and let either failing abort the pull so
    // the local cache stays authoritative.
    if (pendingTasks?.ownerId === userId) {
      try {
        const upserted = await this.upsertTasks(pendingTasks.value ?? [], userId);
        if (!upserted) throw new Error('No authenticated task sync session');
        const deleted = await this.deleteTasks(pendingTasks.deletedIds ?? [], userId);
        if (!deleted) throw new Error('No authenticated task sync session');
        clearPendingSnapshot(pendingTasksKey, pendingTasks);
      } catch (err) {
        console.warn('Could not push pending local tasks before remote load:', err);
        throw err;
      }
    }

    const [profileRes, tasksRes, sessionsRes, energyRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('tasks').select('*').eq('user_id', userId).order('created_at'),
      supabase.from('sessions').select('*').eq('user_id', userId)
        .order('completed_at', { ascending: false }),
      supabase.from('energy').select('*').eq('user_id', userId).single(),
    ]);

    // Reward reconciliation treats this pull as authoritative. Never let a
    // partial query failure look like a complete snapshot: stale profile XP
    // could otherwise finalize opening Gold, while missing Sessions could
    // reverse valid world history.
    const isMissingSingleRow = error => error?.code === 'PGRST116';
    if (profileRes.error && !isMissingSingleRow(profileRes.error)) throw profileRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (sessionsRes.error) throw sessionsRes.error;
    if (energyRes.error && !isMissingSingleRow(energyRes.error)) throw energyRes.error;

    let canonicalUser = null;
    if (profileRes.data) {
      const p = profileRes.data;
      let avatar = null;
      try { avatar = await this.resolveAvatarUrl(p.avatar_url, userId); } catch (err) {
        if (err instanceof OwnerSessionChangedError) throw err;
        console.warn('Avatar URL resolve failed:', err);
      }
      canonicalUser = {
        id:         p.user_id,
        avatar,
        avatarPath: p.avatar_url || null,
        createdAt:  p.created_at,
        ...fromRow(PROFILE_FIELDS, p),
      };
    }

    const canonicalTasks = (tasksRes.data ?? []).map(t => fromRow(TASK_FIELDS, t));
    const remoteSessions = filterDeletedSessions(
      (sessionsRes.data ?? []).map(s => fromRow(SESSION_FIELDS, s)),
      deletedSessionIds,
    );
    const remoteIds = new Set(remoteSessions.map(s => s.id));
    const needsSessionSyncCutover = !hasCompletedSessionSyncCutover(userId);
    const mergeableLocalSessions = localSessions
      .filter(session => (
        session?.id
        && (remoteIds.has(session.id)
          || session._syncPending === true
          || needsSessionSyncCutover)
      ))
      .map(session => (
        needsSessionSyncCutover && !remoteIds.has(session.id)
          ? { ...session, _syncPending: true }
          : session
      ));
    const canonicalSessions = mergeSessionsById(remoteSessions, mergeableLocalSessions);
    const sessionsToBackfill = mergeableLocalSessions
      .filter(s => s?.id && s._syncPending === true && !remoteIds.has(s.id));
    saveOwnerPendingSessions(userId, sessionsToBackfill);

    await Promise.allSettled(Object.entries(sessionDeletionLog).map(async ([sessionId, entry]) => {
      if (entry.remoteConfirmedAt) return;
      recordSessionDeletionAttempt(userId, sessionId, new Date().toISOString());
      const confirmed = await this.deleteSession(sessionId, userId);
      if (confirmed) {
        recordSessionDeletionRemoteConfirmed(userId, sessionId, new Date().toISOString());
      }
    }));

    const canonicalEnergy = energyRes.data
      ? fromRow(ENERGY_FIELDS, energyRes.data)
      : null;

    // Sign-out or account switching can complete while these queries are in
    // flight. Re-check immediately before the synchronous canonical writes so
    // an obsolete owner can never repopulate the shared local cache.
    await this._assertOwner(userId);
    if (canonicalUser) set('user', canonicalUser);
    else if (localUser?.id !== userId) remove('user');
    set('tasks', canonicalTasks);
    set('sessions', canonicalSessions);
    if (canonicalEnergy) set('energy', canonicalEnergy);
    else if (localUser?.id !== userId) remove('energy');
    if (needsSessionSyncCutover) completeSessionSyncCutover(userId);

    sessionsToBackfill.forEach(s => this.insertSession(s, userId)
      .then(inserted => {
        if (inserted) clearSessionSyncPending(s.id, userId);
      })
      .catch(err => {
        console.warn('Could not backfill local session after remote load:', err);
        markSessionSyncPending(s.id, userId);
      }));
  },

  async upsertProfile(user, expectedOwnerId = user?.id) {
    // Dev-tool guard: never sync to Supabase while a dev override backup exists
    if (localStorage.getItem(FLAG_DEV_BACKUP)) return false;
    const session = await this._session();
    if (!session) return false;
    if (expectedOwnerId && session.user.id !== expectedOwnerId) return false;
    // Keep large local previews out of profiles; avatarPath points to Storage.
    const avatarUrl = user.avatarPath || ((user.avatar && user.avatar.startsWith('data:'))
      ? null : (user.avatar || null));
    const { error } = await supabase.from('profiles').upsert({
      user_id:    expectedOwnerId || session.user.id,
      avatar_url: avatarUrl,
      ...toRow(PROFILE_FIELDS, user),
    });
    if (error) throw error;
    return true;
  },

  async uploadAvatar(file) {
    const session = await this._session();
    if (!session) throw new Error('Not authenticated');

    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { cacheControl: '3600', upsert: true });
    if (uploadError) throw uploadError;

    const signed = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signed.error) throw signed.error;
    return { path, url: signed.data?.signedUrl || null };
  },

  async resolveAvatarUrl(pathOrUrl, expectedOwnerId = null) {
    if (!pathOrUrl) return null;
    if (/^(https?:|data:|blob:)/.test(pathOrUrl)) return pathOrUrl;
    const session = await this._session();
    if (!session) return null;
    if (expectedOwnerId && session.user.id !== expectedOwnerId) {
      throw new OwnerSessionChangedError(expectedOwnerId, session.user.id);
    }
    const { data, error } = await supabase.storage
      .from('avatars')
      .createSignedUrl(pathOrUrl, 60 * 60 * 24 * 7);
    if (error) throw error;
    return data?.signedUrl || null;
  },

  async upsertTasks(tasks, expectedOwnerId = null) {
    const session = await this._session();
    if (!session || (expectedOwnerId && session.user.id !== expectedOwnerId)) return false;
    if (!tasks.length) return true;
    // Unchecked before: a rejected write (RLS, CHECK constraint, PostgREST
    // error) resolved as success, so `saveTasks`'s catch never fired and the
    // task stayed local-only until the next remote pull erased it.
    const { error } = await supabase.from('tasks').upsert(
      tasks.map(t => ({ user_id: expectedOwnerId || session.user.id, ...toRow(TASK_FIELDS, t) })),
      { onConflict: 'id' }
    );
    if (error) throw error;
    return true;
  },

  async deleteTasks(ids, expectedOwnerId = null) {
    const session = await this._session();
    if (!session || (expectedOwnerId && session.user.id !== expectedOwnerId)) return false;
    if (!ids.length) return true;
    // Unchecked before, exactly like `upsertTasks`: a rejected delete looked
    // like success, so the tombstone was dropped and the task came back.
    const { error } = await supabase.from('tasks').delete()
      .in('id', ids)
      .eq('user_id', expectedOwnerId || session.user.id);
    if (error) throw error;
    return true;
  },

  async insertSession(session, expectedOwnerId = null) {
    const authSession = await this._session();
    if (!authSession || (expectedOwnerId && authSession.user.id !== expectedOwnerId)) return false;
    const { error } = await supabase.from('sessions').insert({
      user_id: expectedOwnerId || authSession.user.id,
      ...toRow(SESSION_FIELDS, session),
    });
    if (error) throw error;
    return true;
  },

  async deleteSession(id, expectedOwnerId) {
    const session = await this._session();
    if (!session || !expectedOwnerId || session.user.id !== expectedOwnerId) return false;
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', expectedOwnerId);
    if (error) throw error;
    return true;
  },

  /**
   * Refreshes the owner-scoped Pro entitlement snapshot from the server.
   *
   * No-ops under the legacy source so production never calls an RPC that
   * does not exist there yet. A response-level error is authoritative and
   * drops the snapshot; a thrown network failure leaves it in place so the
   * offline grace window in proEntitlement.js can apply.
   */
  async refreshProEntitlement(userId) {
    if (!isServerProEntitlementEnabled()) return false;

    const session = await this._session();
    if (!session || session.user.id !== userId) {
      clearProEntitlementSnapshot();
      return false;
    }

    try {
      const { data, error } = await supabase.rpc('my_pro_status');
      return applyProStatusResponse({ ownerId: userId, rows: data, error });
    } catch (err) {
      console.warn('Pro entitlement refresh failed, keeping cached snapshot:', err);
      return false;
    }
  },

  /**
   * PRO-014C: the server grants the trial, the client only reports it.
   *
   * `start_trial()` is idempotent — its `ON CONFLICT … COALESCE` keeps any
   * existing `trial_started_at` and returns it, without resetting, extending,
   * or raising. So a repeat call is a normal result, not an error path, and
   * callers must not treat it as failure.
   *
   * `is_pro` and `pro_expires_at` are no longer written: a trial is not a
   * purchase, and those were the client-writable fields this workstream exists
   * to stop trusting. `trial_started_at` is still written back — see below.
   *
   * @returns {{ok: boolean, ownerChanged: boolean, trialStartedAt: string|null}}
   *   `ownerChanged` is the only outcome a boot sequence may abort on. An RPC
   *   failure returns `ok: false` and must stay non-fatal: the trial is worth
   *   retrying next launch, not worth stranding the user on a loading screen.
   */
  async startTrial(userId) {
    const session = await this._session();
    if (!session || session.user.id !== userId) {
      return { ok: false, ownerChanged: true, trialStartedAt: null };
    }

    let startedAt = null;
    try {
      const { data, error } = await supabase.rpc('start_trial');
      if (error) throw error;
      startedAt = _normalizeTrialTimestamp(data);
    } catch (err) {
      console.warn('start_trial RPC failed:', err);
      return { ok: false, ownerChanged: false, trialStartedAt: null };
    }
    if (!startedAt) return { ok: false, ownerChanged: false, trialStartedAt: null };

    // ── LEGACY COMPATIBILITY LAYER — remove together with PRO-014H ──────────
    // Production still runs the `legacy` source, whose isTrialUser() reads
    // user.trialStartedAt; refreshProEntitlement() no-ops under `legacy`, so
    // the projection is never populated there and cannot back the trial. The
    // value written is always the server's — the client never computes it.
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ trial_started_at: startedAt })
        .eq('user_id', userId);
      if (error) throw error;
    } catch (err) {
      // Non-fatal: the local write below still lets this session behave
      // correctly, and the next successful profile sync carries the value up.
      console.warn('trial_started_at legacy write-back failed:', err);
    }

    const user = get('user');
    if (user?.id === userId) {
      user.trialStartedAt = startedAt;
      set('user', user);
    }
    return { ok: true, ownerChanged: false, trialStartedAt: startedAt };
  },

  async upsertEnergy(energy, expectedOwnerId = null) {
    const session = await this._session();
    if (!session) return false;
    if (expectedOwnerId && session.user.id !== expectedOwnerId) return false;
    const { error } = await supabase.from('energy').upsert(
      { user_id: expectedOwnerId || session.user.id, ...toRow(ENERGY_FIELDS, energy) },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    return true;
  },
};

// ─── Sync localStorage API (unchanged signatures) ─────────────────────────────

export const storage = {
  recoverPendingSessionDeletions,

  // ── User ─────────────────────────────────────────────────────────────────────
  getUser:    ()  => get('user'),
  /** @returns {boolean} whether the local write succeeded (see `set`). */
  saveUser:   (u) => {
    const saved = set('user', u);
    const ownerId = u?.id;
    if (!ownerId) return saved;
    const pending = createPendingSnapshot(ownerId, u);
    const pendingKey = ownerSyncPendingKey(PROFILE_SYNC_PENDING_KEY, ownerId);
    set(pendingKey, pending);
    db.upsertProfile(u, ownerId)
      .then(synced => {
        if (synced) clearPendingSnapshot(pendingKey, pending);
      })
      .catch(console.error);
    return saved;
  },
  /** Local-only write — no Supabase sync（profile 樂觀更新、dev tools 用）。 */
  saveUserLocal: (u) => {
    try { set('user', u); } catch (err) { console.error('Local user save failed:', err); }
  },
  saveUserAndSync: async (u) => {
    set('user', u);
    const pending = createPendingSnapshot(u?.id, u);
    const pendingKey = ownerSyncPendingKey(PROFILE_SYNC_PENDING_KEY, u?.id);
    if (pendingKey) set(pendingKey, pending);
    const synced = await db.upsertProfile(u, u?.id);
    if (synced && pendingKey) {
      clearPendingSnapshot(pendingKey, pending);
    } else if (!synced) {
      // No active session — mark so loadFromRemote can push before pulling
      set('user', { ...u, _syncPending: true });
    }
    return synced;
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────
  getTasks:   ()  => get('tasks') ?? [],
  saveTasks:  (t) => {
    const prev = get('tasks') ?? [];
    set('tasks', t);
    const ownerId = get('user')?.id;
    if (!ownerId) return;
    // Treat the list as unsynced until Supabase confirms it. loadFromRemote
    // overwrites the local task cache wholesale, so without this sidecar any
    // task added while offline (or whose upsert failed) is silently dropped
    // on the next authenticated launch — and any delete that never landed is
    // silently undone. The snapshot carries both halves and is only cleared
    // once the upsert AND the delete come back confirmed.
    const pendingKey = ownerSyncPendingKey(TASK_SYNC_PENDING_KEY, ownerId);
    const removedIds = prev.filter(p => !t.find(n => n.id === p.id)).map(p => p.id);
    const pendingSnapshot = saveOwnerPendingTasks(ownerId, t, removedIds);
    // Retries the whole tombstone backlog, not just this save's removals.
    const deletedIds = pendingSnapshot?.deletedIds ?? removedIds;
    Promise.all([
      db.upsertTasks(t, ownerId),
      db.deleteTasks(deletedIds, ownerId),
    ])
      .then(([upserted, deleted]) => {
        if (upserted && deleted && pendingKey && pendingSnapshot) {
          clearPendingSnapshot(pendingKey, pendingSnapshot);
        }
      })
      .catch(console.error);
  },

  // ── Sessions ─────────────────────────────────────────────────────────────────
  getSessions:  ()  => {
    const sessions = get('sessions') ?? [];
    const ownerId = get('user')?.id;
    return ownerId
      ? filterDeletedSessions(sessions, loadSessionDeletionLog(ownerId))
      : sessions;
  },
  saveSessions: (s) => {
    const prev = get('sessions') ?? [];
    const ownerId = get('user')?.id;
    const previousById = new Map(prev.filter(session => session?.id).map(session => [session.id, session]));
    const newIds = new Set(s
      .filter(ns => !prev.find(ps => ps.id === ns.id))
      .map(ns => ns.id));
    const persistedSessions = s.map(session => (
      newIds.has(session.id) || previousById.get(session.id)?._syncPending === true
        ? { ...session, _syncPending: true }
        : session
    ));
    set('sessions', persistedSessions);
    // Only INSERT the newly added sessions (not the whole array)
    if (!ownerId) return;
    saveOwnerPendingSessions(
      ownerId,
      persistedSessions.filter(session => session?._syncPending === true),
    );
    s.filter(ns => newIds.has(ns.id))
     .forEach(ns => db.insertSession(ns, ownerId)
       .then(inserted => {
         if (inserted) clearSessionSyncPending(ns.id, ownerId);
       })
       .catch(err => {
         console.error(err);
         markSessionSyncPending(ns.id, ownerId);
       }));
  },

  // ── Energy ───────────────────────────────────────────────────────────────────
  getEnergy:   ()  => get('energy') ?? { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' },
  /** @returns {boolean} whether the local write succeeded (see `set`). */
  saveEnergy:  (e) => {
    const saved = set('energy', e);
    const ownerId = get('user')?.id;
    const pending = ownerId ? createPendingSnapshot(ownerId, e) : null;
    const pendingKey = ownerSyncPendingKey(ENERGY_SYNC_PENDING_KEY, ownerId);
    if (pendingKey) set(pendingKey, pending);
    if (!ownerId) return saved;
    db.upsertEnergy(e, ownerId)
      .then(synced => {
        if (synced && pending) clearPendingSnapshot(pendingKey, pending);
      })
      .catch(console.error);
    return saved;
  },

  // ── Legacy (migration read-only) ─────────────────────────────────────────────
  getGoals:   ()  => get('goals') ?? [],
  getLogs:    ()  => get('logs')  ?? [],

  // ── Pro / Trial status ───────────────────────────────────────────────────────
  /**
   * PRO-014C: paid-vs-trial must follow the same source as isProUser().
   *
   * Reading the legacy profile fields here while isProUser() read the
   * projection produced a paying customer with isProUser() true and
   * isPaidProUser() false — the settings page then hid the active banner and
   * pitched them the subscription they already own.
   */
  isPaidProUser() {
    if (isServerProEntitlementEnabled()) {
      return getPaidProStateFromSnapshot(get('user')?.id || null)?.isPaid === true;
    }
    const user = get('user');
    if (!user || !user.isPro) return false;
    if (!user.proExpiresAt) return true;            // lifetime Pro
    return new Date(user.proExpiresAt) > new Date();
  },
  /**
   * PRO-014C: under the `server` source the trial end comes from the projection
   * (the server computed it with pro_trial_duration()); under `legacy` it is
   * still derived from the profile field, which is the only thing that source
   * has. Both paths must render the same countdown for the same user.
   */
  _trialEndMs() {
    if (isServerProEntitlementEnabled()) {
      const endsAt = getTrialEndsAtFromSnapshot(get('user')?.id || null);
      return endsAt ? Date.parse(endsAt) : null;
    }
    const startedAt = get('user')?.trialStartedAt;
    if (!startedAt) return null;
    const startedMs = Date.parse(startedAt);
    return Number.isNaN(startedMs) ? null : startedMs + TRIAL_DURATION_MS;
  },
  isTrialUser() {
    const endMs = this._trialEndMs();
    return endMs !== null && Date.now() < endMs;
  },
  /**
   * PRO-014B: under the `server` source the decision comes only from the
   * owner-scoped snapshot built from `my_pro_status()`, never from the
   * client-writable profile fields. The legacy path stays the default until
   * PRO-014H performs the cutover — flipping it before migration 011 exists in
   * the target database would fail closed and strip Pro from paying users.
   */
  isProUser() {
    if (isServerProEntitlementEnabled()) return isProFromSnapshot(get('user')?.id || null);
    return this.isPaidProUser() || this.isTrialUser();
  },
  /** Only meaningful when isPaidProUser(); null there means a lifetime plan. */
  getProExpiry() {
    if (isServerProEntitlementEnabled()) {
      return getPaidProStateFromSnapshot(get('user')?.id || null)?.expiresAt ?? null;
    }
    return get('user')?.proExpiresAt || null;
  },
  getTrialDaysRemaining() {
    const endMs = this._trialEndMs();
    if (endMs === null) return 0;
    return Math.max(0, Math.ceil((endMs - Date.now()) / (24 * 60 * 60 * 1000)));
  },
  /**
   * How far through the trial the user is, 0–100, or null when unknown.
   *
   * The settings page used to compute this as `(15 - daysLeft) / 15`, which
   * hardcodes the trial length on the client. Under the `server` source the
   * end date comes from pro_trial_duration(), so a change there would have
   * produced a wrong — possibly negative — bar. The span is derived from the
   * actual start and end instead, and null (rather than a guess) is returned
   * when the start is not known, so the caller can omit the bar.
   */
  getTrialProgressPercent() {
    const endMs = this._trialEndMs();
    if (endMs === null) return null;

    const startMs = Date.parse(get('user')?.trialStartedAt ?? '');
    if (Number.isNaN(startMs)) return null;

    const totalMs = endMs - startMs;
    if (totalMs <= 0) return null;

    const elapsedMs = totalMs - (endMs - Date.now());
    return Math.max(0, Math.min(100, Math.round(elapsedMs / totalMs * 100)));
  },
  getTrialBannerDismissDate:  ()  => get('trialBannerDismiss') || '',
  saveTrialBannerDismissDate: (d) => set('trialBannerDismiss', d),

  // ── Manual cloud sync ────────────────────────────────────────────────────────
  // Two-tier rate limit: 10 s cooldown between clicks, 3 times per rolling hour.
  async syncFromRemote() {
    const COOLDOWN_KEY = 'orbit_sync_last';
    const HISTORY_KEY  = 'orbit_sync_history';
    const COOLDOWN_MS  = 10_000;
    const MAX_PER_HOUR = 3;
    const HOUR_MS      = 60 * 60 * 1000;

    const now = Date.now();

    const lastMs = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10);
    const secondsLeft = Math.ceil((lastMs + COOLDOWN_MS - now) / 1000);
    if (secondsLeft > 0) throw new Error(`cooldown:${secondsLeft}`);

    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      .filter(t => now - t < HOUR_MS);
    if (history.length >= MAX_PER_HOUR) throw new Error('ratelimit');

    const session = await db._session();
    if (!session) throw new Error('unauthenticated');

    await db.loadFromRemote(session.user.id);

    localStorage.setItem(COOLDOWN_KEY, String(now));
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...history, now]));
  },

  // ── Theme / Background (local only) ──────────────────────────────────────────
  getTheme:    ()  => get('theme') || 'dark-purple',
  saveTheme:   (t) => set('theme', t),
  getUiSkin:    ()  => get('uiSkin') || 'classic',
  saveUiSkin:   (s) => set('uiSkin', s === 'modern' ? 'modern' : 'classic'),
  getRandomThemeEnabled: ()  => !!get('randomThemeEnabled'),
  saveRandomThemeEnabled:(v) => set('randomThemeEnabled', !!v),
  getRandomThemeDate:    ()  => get('randomThemeDate') || '',
  saveRandomThemeDate:   (d) => set('randomThemeDate', d),
  getBgImage:  ()  => localStorage.getItem(PREFIX + 'bgImage') || null,
  saveBgImage: (d) => d
    ? localStorage.setItem(PREFIX + 'bgImage', d)
    : localStorage.removeItem(PREFIX + 'bgImage'),

  // ── Leaderboard cache (local only; refreshed once per effective day) ───────
  getLeaderboardCache: () => get(LEADERBOARD_CACHE_KEY),
  saveLeaderboardCache: (rows, refreshedAt, refreshDate) => {
    set(LEADERBOARD_CACHE_KEY, { rows, refreshedAt, refreshDate });
  },

  // ── Daily Plan (local only, resets each day) ─────────────────────────────────
  getDailyPlan: () => {
    const data     = get('dailyPlan');
    const todayStr = today();
    if (!data || data.date !== todayStr) return [];
    return data.taskIds || [];
  },
  saveDailyPlan: (taskIds) => {
    const todayStr = today();
    set('dailyPlan', { date: todayStr, taskIds });
  },

  // ── Clear all local data (on sign-out) ────────────────────────────────────────
  clearAll: () => {
    // Owner-scoped pending profile/Energy snapshots deliberately survive
    // sign-out so an offline undo can be pushed when that owner returns.
    ['user','tasks','sessions','energy','goals','logs','theme','uiSkin','bgImage','dailyPlan',
      'trialBannerDismiss', LEADERBOARD_CACHE_KEY]
      .forEach(k => localStorage.removeItem(PREFIX + k));
    // The entitlement snapshot must never outlive its owner's session: a
    // leftover snapshot is exactly how the next account would inherit Pro.
    clearProEntitlementSnapshot();
  },
};

// ─── Migration: tag existing default tasks with isDefault:true ───────────────

const _DEFAULT_TASK_NAMES = new Set([
  '高價值深度輸出','深度學習 45 分鐘','運動 30 分鐘','閱讀高品質內容 30 分鐘',
  '例行工作處理','記帳 / 檢查支出','整理環境 10 分鐘','回覆必要訊息 / 行政處理',
  '散步 20 分鐘','午休 / 冥想 / 伸展','追劇 / 看影片 30 分鐘','遊戲 30 分鐘',
  '短影音 / 無目的滑手機 15 分鐘',
]);

export function migrateDefaultFlags() {
  const tasks = get('tasks');
  if (!tasks) return;
  let changed = false;
  tasks.forEach(t => {
    if (t.isDefault === undefined && _DEFAULT_TASK_NAMES.has(t.name)) {
      t.isDefault = true;
      changed = true;
    }
  });
  if (changed) set('tasks', tasks);
}

// ─── Migration: v1 (goals/logs) → v2 (tasks/sessions) ────────────────────────

export function migrateV1toV2(today) {
  if (get('tasks') !== null) return;   // Already migrated

  const oldGoals = get('goals') ?? [];
  const oldLogs  = get('logs')  ?? [];

  const tasks = oldGoals.map(g => ({
    id:                  g.id,
    name:                g.name,
    category:            'instant',
    impactType:          'task',
    taskNature:          'maintenance',
    value:               'B',
    difficulty:          0.4,
    resistance:          1.0,
    emoji:               g.emoji   || '🎯',
    iconImg:             g.iconImg || null,
    minEffectiveMinutes: 0,
    cooldownMinutes:     0,
    dailyXpCap:          100,
    valueConfidence:     100,
    createdAt:           today,
  }));
  set('tasks', tasks);

  const sessions = oldLogs.map(l => {
    const task = tasks.find(t => t.id === l.goalId) || {};
    return {
      id:              l.id,
      taskId:          l.goalId,
      taskName:        l.goalName,
      taskEmoji:       l.goalEmoji || '🎯',
      date:            l.date,
      startedAt:       l.completedAt,
      completedAt:     l.completedAt,
      durationMinutes: 0,
      result:          'instant',
      baseXP:          l.xp,
      finalXP:         l.xp,
      energyCost:      0,
      energyGain:      0,
      impactType:      task.impactType || 'task',
      taskNature:      task.taskNature || 'maintenance',
      value:           task.value      || 'B',
      resistance:      task.resistance || 1.0,
      isProductiveXP:  true,
    };
  });
  set('sessions', sessions);
}
