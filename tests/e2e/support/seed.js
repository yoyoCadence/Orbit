// Shared E2E fixtures and storage/CDN seeding helpers.
//
// Used by flows.test.js and ps243-acceptance.test.js so the offline Supabase
// stub and guest-mode localStorage seed live in one place.

export const TODAY = new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local tz — matches app today()

export const GUEST_USER = {
  id: 'e2e-user', name: 'E2E Tester', totalXP: 0,
  streakDays: 0, lastStreakDate: TODAY, lastWeeklyBonusDate: '',
  morningState: 'normal', mode: 'normal', isPublic: false,
  createdAt: TODAY,
  // newDayHour:0 → effectiveToday(0) always equals today(); prevents the
  // daily-report modal from appearing when CI runs in UTC before 05:00 local.
  newDayHour: 0,
};

export const INSTANT_TASK = {
  id: 'task-instant', name: '喝水', category: 'instant',
  impactType: 'task', taskNature: 'maintenance', value: 'B',
  difficulty: 0.4, resistance: 1.0, emoji: '💧',
  dailyXpCap: 100, cooldownMinutes: 0, minEffectiveMinutes: 0,
  isDefault: true, valueConfidence: 100, createdAt: TODAY,
};

export const FOCUS_TASK = {
  id: 'task-focus', name: '深度學習', category: 'focus',
  impactType: 'task', taskNature: 'growth', value: 'A',
  difficulty: 0.7, resistance: 1.2, emoji: '🧠',
  dailyXpCap: 200, cooldownMinutes: 0, minEffectiveMinutes: 1,
  isDefault: true, valueConfidence: 100, createdAt: TODAY,
};

export const BASE_ENERGY = {
  currentEnergy: 90, maxEnergy: 100, lastResetDate: TODAY,
};

// Minimal unauthenticated Supabase client so tests run fully offline.
const SUPABASE_STUB = `
export function createClient() {
  const chain = () => {
    const q = {
      select: () => q, eq: () => q, order: () => q,
      upsert: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      delete: () => q,
      in:     () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then:   (r) => Promise.resolve({ data: null, error: null }).then(r),
    };
    return q;
  };
  return {
    auth: {
      getSession:         () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange:  () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signUp:             () => Promise.resolve({ data: null, error: { message: 'E2E mock' } }),
      signInWithOAuth:    () => Promise.resolve({ data: null, error: null }),
      signOut:            () => Promise.resolve({ error: null }),
    },
    from: () => chain(),
  };
}
`;

/** Intercept the Supabase CDN import (required in every test). */
export async function mockSupabase(page) {
  await page.route('https://esm.sh/**', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/javascript; charset=utf-8',
      body:        SUPABASE_STUB,
    })
  );
}

/** Inject guest-mode localStorage before any page script runs. */
export async function seedStorage(page, tasks, sessions = [], user = GUEST_USER) {
  await page.addInitScript(({ user, tasks, sessions, energy }) => {
    const P = 'yoyo_';
    if (!localStorage.getItem(P + 'user')) {
      localStorage.setItem(P + 'user', JSON.stringify(user));
    }
    if (!localStorage.getItem(P + 'tasks')) {
      localStorage.setItem(P + 'tasks', JSON.stringify(tasks));
    }
    if (!localStorage.getItem(P + 'sessions')) {
      localStorage.setItem(P + 'sessions', JSON.stringify(sessions));
    }
    if (!localStorage.getItem(P + 'energy')) {
      localStorage.setItem(P + 'energy', JSON.stringify(energy));
    }
  }, { user, tasks, sessions, energy: BASE_ENERGY });
}
