// Data persistence abstraction layer
// Sync reads/writes → localStorage (always available, used as cache)
// Async background sync → Supabase (when authenticated + online)

import { supabase }  from './supabase.js';
import { today, mergeSessionsById } from './utils.js';
import { FLAG_DEV_BACKUP } from './flags.js';
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

function get(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}
function set(key, val) {
  localStorage.setItem(PREFIX + key, JSON.stringify(val));
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

function markSessionSyncPending(sessionId, expectedOwnerId) {
  if (!isCachedOwner(expectedOwnerId)) return;
  const sessions = get('sessions') ?? [];
  const idx = sessions.findIndex(s => s?.id === sessionId);
  if (idx === -1) return;
  sessions[idx] = { ...sessions[idx], _syncPending: true };
  set('sessions', sessions);
}

function clearSessionSyncPending(sessionId, expectedOwnerId) {
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
    const sessionDeletionLog = loadSessionDeletionLog(userId);
    const deletedSessionIds = new Set(Object.keys(sessionDeletionLog));
    const localSessions = localUser?.id === userId
      ? filterDeletedSessions(get('sessions') ?? [], deletedSessionIds)
      : [];
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
    let canonicalSessions = [];
    let sessionsToBackfill = [];

    if (sessionsRes.data) {
      const remoteSessions = filterDeletedSessions(
        sessionsRes.data.map(s => fromRow(SESSION_FIELDS, s)),
        deletedSessionIds,
      );
      const remoteIds = new Set(remoteSessions.map(s => s.id));
      const mergeableLocalSessions = localSessions.filter(session => (
        session?.id
        && (remoteIds.has(session.id) || session._syncPending === true)
      ));
      canonicalSessions = mergeSessionsById(remoteSessions, mergeableLocalSessions);
      sessionsToBackfill = mergeableLocalSessions
        .filter(s => s?.id && s._syncPending === true && !remoteIds.has(s.id));

      await Promise.allSettled(Object.entries(sessionDeletionLog).map(async ([sessionId, entry]) => {
        if (entry.remoteConfirmedAt) return;
        recordSessionDeletionAttempt(userId, sessionId, new Date().toISOString());
        const confirmed = await this.deleteSession(sessionId, userId);
        if (confirmed) {
          recordSessionDeletionRemoteConfirmed(userId, sessionId, new Date().toISOString());
        }
      }));
    }

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
    await supabase.from('tasks').upsert(
      tasks.map(t => ({ user_id: expectedOwnerId || session.user.id, ...toRow(TASK_FIELDS, t) })),
      { onConflict: 'id' }
    );
    return true;
  },

  async deleteTasks(ids, expectedOwnerId = null) {
    const session = await this._session();
    if (!session || (expectedOwnerId && session.user.id !== expectedOwnerId)) return false;
    if (!ids.length) return true;
    await supabase.from('tasks').delete()
      .in('id', ids)
      .eq('user_id', expectedOwnerId || session.user.id);
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

  async startTrial(userId) {
    const session = await this._session();
    if (!session || session.user.id !== userId) return false;
    const now    = new Date().toISOString();
    const expiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('profiles').update({
      is_pro:           true,
      pro_expires_at:   expiry,
      trial_started_at: now,
    }).eq('user_id', userId);
    const user = get('user');
    if (user?.id === userId) {
      user.isPro          = true;
      user.proExpiresAt   = expiry;
      user.trialStartedAt = now;
      set('user', user);
    }
    return true;
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
  saveUser:   (u) => {
    set('user', u);
    const ownerId = u?.id;
    if (!ownerId) return;
    const pending = createPendingSnapshot(ownerId, u);
    const pendingKey = ownerSyncPendingKey(PROFILE_SYNC_PENDING_KEY, ownerId);
    set(pendingKey, pending);
    db.upsertProfile(u, ownerId)
      .then(synced => {
        if (synced) clearPendingSnapshot(pendingKey, pending);
      })
      .catch(console.error);
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
    db.upsertTasks(t, ownerId).catch(console.error);
    const removedIds = prev.filter(p => !t.find(n => n.id === p.id)).map(p => p.id);
    if (removedIds.length) db.deleteTasks(removedIds, ownerId).catch(console.error);
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
  saveEnergy:  (e) => {
    set('energy', e);
    const ownerId = get('user')?.id;
    const pending = ownerId ? createPendingSnapshot(ownerId, e) : null;
    const pendingKey = ownerSyncPendingKey(ENERGY_SYNC_PENDING_KEY, ownerId);
    if (pendingKey) set(pendingKey, pending);
    if (!ownerId) return;
    db.upsertEnergy(e, ownerId)
      .then(synced => {
        if (synced && pending) clearPendingSnapshot(pendingKey, pending);
      })
      .catch(console.error);
  },

  // ── Legacy (migration read-only) ─────────────────────────────────────────────
  getGoals:   ()  => get('goals') ?? [],
  getLogs:    ()  => get('logs')  ?? [],

  // ── Pro / Trial status ───────────────────────────────────────────────────────
  isPaidProUser: () => {
    const user = get('user');
    if (!user || !user.isPro) return false;
    if (!user.proExpiresAt) return true;            // lifetime Pro
    return new Date(user.proExpiresAt) > new Date();
  },
  isTrialUser: () => {
    const user = get('user');
    if (!user?.trialStartedAt) return false;
    const end = new Date(user.trialStartedAt).getTime() + 15 * 24 * 60 * 60 * 1000;
    return Date.now() < end;
  },
  isProUser() {
    return this.isPaidProUser() || this.isTrialUser();
  },
  getProExpiry: () => get('user')?.proExpiresAt || null,
  getTrialDaysRemaining: () => {
    const user = get('user');
    if (!user?.trialStartedAt) return 0;
    const end = new Date(user.trialStartedAt).getTime() + 15 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
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
