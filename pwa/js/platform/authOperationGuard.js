function normalizeOwnerId(sessionOrOwnerId) {
  if (typeof sessionOrOwnerId === 'string') return sessionOrOwnerId;
  return sessionOrOwnerId?.user?.id || null;
}

/**
 * Issues monotonically increasing tokens for auth-bound async work.
 * A token becomes stale as soon as sign-out or a different account begins.
 */
export function createAuthOperationGuard() {
  let generation = 0;
  let ownerId = null;

  return {
    begin(sessionOrOwnerId) {
      ownerId = normalizeOwnerId(sessionOrOwnerId);
      generation += 1;
      return Object.freeze({ generation, ownerId });
    },

    invalidate() {
      ownerId = null;
      generation += 1;
    },

    isCurrent(token) {
      return Boolean(
        token
        && token.generation === generation
        && token.ownerId === ownerId
        && ownerId,
      );
    },

    getOwnerId() {
      return ownerId;
    },
  };
}
