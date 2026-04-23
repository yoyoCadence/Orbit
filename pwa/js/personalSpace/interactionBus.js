export const PERSONAL_SPACE_NODE_SELECTED_EVENT = 'personal-space:node-selected';
export const PERSONAL_SPACE_ACTION_REQUESTED_EVENT = 'personal-space:action-requested';

export function createInteractionBus() {
  const listeners = new Map();

  return {
    on(eventName, handler) {
      const set = listeners.get(eventName) || new Set();
      set.add(handler);
      listeners.set(eventName, set);
      return () => set.delete(handler);
    },
    emit(eventName, payload) {
      const set = listeners.get(eventName);
      if (!set) return;
      set.forEach(handler => handler(payload));
    },
  };
}
