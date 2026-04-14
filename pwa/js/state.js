// Central state — mutated by app.js; read-only for pages
//
// user    : { id, name, avatar, totalXP, streakDays, lastStreakDate, createdAt, morningState }
// tasks   : Task[]   (replaces goals)
// sessions: Session[] (replaces logs)
// energy  : { currentEnergy, maxEnergy, lastResetDate }

export const state = {
  user:      null,
  tasks:     [],
  sessions:  [],
  energy:    { currentEnergy: 100, maxEnergy: 100, lastResetDate: '' },
  dailyPlan: [], // taskIds planned for today; resets each day
};
