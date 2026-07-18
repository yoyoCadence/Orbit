import { REWARD_EPOCH } from './config.js';
import {
  adaptSessions,
  compareSessionsEarliest,
} from './sessionAdapter.js';

export const DAILY_MAIN_QUEST_ID = 'daily-main-quest';
export const DAILY_MAIN_QUEST_TARGET = 1;

function tombstonedSourceIds(tombstones = []) {
  return new Set((Array.isArray(tombstones) ? tombstones : [])
    .map(tombstone => tombstone?.sourceId)
    .filter(Boolean));
}

/** Select exactly one winner per Session calendar date. */
export function selectDailyMainQuestWinners(sessions = [], options = {}) {
  const blockedSources = tombstonedSourceIds(options.tombstones);
  const candidates = adaptSessions(sessions, {
    rewardEpoch: options.rewardEpoch ?? REWARD_EPOCH,
  })
    .filter(session => session.isDailyMainQuestCandidate)
    .filter(session => !blockedSources.has(session.id))
    .sort((left, right) => {
      const dateOrder = left.date.localeCompare(right.date);
      return dateOrder || compareSessionsEarliest(left, right);
    });

  const winners = new Map();
  for (const session of candidates) {
    if (!winners.has(session.date)) winners.set(session.date, session);
  }
  return [...winners.values()];
}

export function buildDailyMainQuestIndex(sessions = [], options = {}) {
  return Object.fromEntries(
    selectDailyMainQuestWinners(sessions, options)
      .map(session => [session.date, session.id]),
  );
}

export function getDailyMainQuestWinnerIds(sessions = [], options = {}) {
  return selectDailyMainQuestWinners(sessions, options).map(session => session.id);
}

export function isDailyMainQuestWinner(session, sessions = [], options = {}) {
  if (!session) return false;
  const index = buildDailyMainQuestIndex(sessions, options);
  const date = session.date || session.original?.date;
  const id = session.id || session.original?.id;
  return Boolean(date && id && index[date] === id);
}

export function getDailyMainQuestState(sessions = [], date, options = {}) {
  const winner = selectDailyMainQuestWinners(sessions, options)
    .find(session => session.date === date) || null;
  return {
    id: `${DAILY_MAIN_QUEST_ID}:${date}`,
    questKey: DAILY_MAIN_QUEST_ID,
    date,
    label: '完成一次 25 分鐘以上的 A／S 任務',
    target: DAILY_MAIN_QUEST_TARGET,
    progress: winner ? 1 : 0,
    completed: Boolean(winner),
    completedBySessionId: winner?.id || null,
  };
}

export const deriveDailyMainQuest = getDailyMainQuestState;
