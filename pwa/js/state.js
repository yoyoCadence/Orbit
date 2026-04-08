// Central state — imported by both app.js and pages
// app.js mutates these objects in place; pages read them

export const state = {
  user: null,   // { id, name, avatar, totalXP, createdAt }
  goals: [],    // [{ id, name, emoji, xp }]
  logs: [],     // [{ id, goalId, goalName, goalEmoji, xp, date, completedAt }]
};
