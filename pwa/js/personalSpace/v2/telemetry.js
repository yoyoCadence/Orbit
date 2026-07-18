const SCHEMA_VERSION = 1;

const EVENT_SCHEMAS = Object.freeze({
  orbit_window_viewed: ['renderPath', 'projectPhase', 'runtimeReady'],
  orbit_window_opened: ['entryPoint', 'projectPhase'],
  personal_space_loaded: ['renderMode', 'renderPath', 'loadMs', 'projectPhase'],
  reward_reveal_started: ['rewardBatchType', 'revealClass', 'renderMode', 'reducedMotion'],
  reward_reveal_completed: [
    'rewardBatchType',
    'revealClass',
    'renderMode',
    'reducedMotion',
    'durationMs',
    'completionMode',
  ],
  project_progressed: ['projectId', 'fromPhase', 'toPhase', 'sourceCategory'],
  project_completed: ['projectId', 'sourceCategory'],
  companion_interacted: ['companionState', 'interactionKey', 'renderMode'],
  edit_mode_opened: ['sceneId', 'ownedCountBand'],
  quest_completed: ['questType', 'effectiveDate', 'sourceCategory'],
});

let adapter = Object.freeze({ emit: () => {} });
let sequence = 0;
const emittedEventIds = new Set();

export function createLocalTelemetryAdapter({ limit = 100 } = {}) {
  const events = [];
  return {
    emit(event) {
      events.push(event);
      if (events.length > limit) events.splice(0, events.length - limit);
    },
    getEvents: () => events.map(event => ({ ...event, properties: { ...event.properties } })),
    clear: () => { events.length = 0; },
  };
}

/** Test/dev seam. Production remains no-op until an analytics provider is approved. */
export function setPersonalSpaceTelemetryAdapter(nextAdapter) {
  adapter = nextAdapter && typeof nextAdapter.emit === 'function'
    ? nextAdapter
    : Object.freeze({ emit: () => {} });
}

export function emitPersonalSpaceTelemetry(eventName, properties = {}, options = {}) {
  const allowedProperties = EVENT_SCHEMAS[eventName];
  if (!allowedProperties) return null;

  const sanitized = { schemaVersion: SCHEMA_VERSION };
  allowedProperties.forEach(key => {
    const value = sanitizeValue(properties[key]);
    if (value !== undefined) sanitized[key] = value;
  });
  if (allowedProperties.some(key => !(key in sanitized))) return null;

  const occurredAt = options.occurredAt || new Date().toISOString();
  const eventId = String(options.eventId || `psv2:${eventName}:${occurredAt}:${sequence += 1}`);
  if (emittedEventIds.has(eventId)) return null;
  emittedEventIds.add(eventId);
  if (emittedEventIds.size > 500) emittedEventIds.delete(emittedEventIds.values().next().value);

  const event = Object.freeze({
    eventId,
    eventName,
    occurredAt,
    properties: Object.freeze(sanitized),
  });
  try { adapter.emit(event); } catch { /* Telemetry must never affect product behavior. */ }
  return event;
}

function sanitizeValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 80) return value;
  return undefined;
}
