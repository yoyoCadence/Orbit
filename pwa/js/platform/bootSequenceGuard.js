/**
 * Gates the once-per-launch day-rollover boot sequence (BUG-106).
 *
 * `bootWithLocalState()` has two independent callers in a single launch:
 *   A. `init()`'s cached-user branch, which boots immediately from localStorage
 *   B. `onAuthStateChange('SIGNED_IN')` → `loadAndStart()`
 *
 * Path B's own gate compares against `_currentSession`, which is only assigned
 * once `getSession()` resolves. When Supabase emits `SIGNED_IN` first — token
 * refresh, slow network, a PWA resumed from the background — that variable is
 * still `null` and the whole sequence runs a second time: two stacked daily
 * report / morning modals, and `processYesterdayStreak()` / `checkWeeklyBonus()`
 * re-run against the freshly pulled remote profile, which may not yet carry the
 * `lastStreakDate` / `lastWeeklyBonusDate` the first pass just wrote.
 *
 * The gate is scoped to an owner rather than to the page, so the legitimate
 * repeats still work: signing out resets it, and signing into a different
 * account claims it again.
 */
export function createBootSequenceGuard() {
  let claimedOwnerId = null;
  let claimed = false;

  return {
    /**
     * Claims the boot sequence for `ownerId` (`null` for a guest).
     * Returns `true` for the caller that may run it, `false` for a repeat
     * within the same launch and owner.
     */
    claim(ownerId = null) {
      const owner = ownerId ?? null;
      if (claimed && claimedOwnerId === owner) return false;
      claimed = true;
      claimedOwnerId = owner;
      return true;
    },

    /** Releases the claim so the next sign-in boots normally (sign-out). */
    reset() {
      claimed = false;
      claimedOwnerId = null;
    },

    /** Owner the current launch booted for, or `null` when nothing booted. */
    getOwnerId() {
      return claimed ? claimedOwnerId : null;
    },

    hasBooted() {
      return claimed;
    },
  };
}
