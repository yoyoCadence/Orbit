const SCHEMA_VERSION = 1;

const renderMode = oneOf('home-window', 'full-world', 'edit');
const projectPhase = oneOf(
  'empty-work-corner',
  'basic-desk',
  'light-and-storage',
  'monitor-and-planning-board',
  'formal-workstation',
);
const sourceCategory = oneOf(
  'task', 'recovery', 'growth', 'maintenance', 'necessary', 'entertainment', 'main-quest', 'system',
);

const EVENT_SCHEMAS = Object.freeze({
  orbit_window_viewed: schema({
    renderPath: oneOf('pixi', 'poster-fallback'),
    projectPhase,
    runtimeReady: booleanValue,
  }),
  orbit_window_opened: schema({ entryPoint: renderMode, projectPhase }),
  personal_space_loaded: schema({
    renderMode,
    renderPath: oneOf('v2-pixi', 'poster-fallback'),
    loadMs: numberInRange(0, 600_000),
    projectPhase,
  }),
  reward_reveal_started: schema({
    rewardBatchType: oneOf('settlement', 'reversal', 'mixed'),
    revealClass: oneOf('small', 'medium', 'major'),
    renderMode,
    reducedMotion: booleanValue,
  }),
  reward_reveal_completed: schema({
    rewardBatchType: oneOf('settlement', 'reversal', 'mixed'),
    revealClass: oneOf('small', 'medium', 'major'),
    renderMode,
    reducedMotion: booleanValue,
    durationMs: numberInRange(0, 60_000),
    completionMode: oneOf('timer'),
  }),
  project_progressed: schema({
    projectId: oneOf('workspace-upgrade'),
    fromPhase: projectPhase,
    toPhase: projectPhase,
    sourceCategory,
  }),
  project_completed: schema({ projectId: oneOf('workspace-upgrade'), sourceCategory }),
  companion_interacted: schema({
    companionState: oneOf('observe', 'approach', 'remind', 'congratulate', 'rest', 'work'),
    interactionKey: oneOf(
      'observe', 'approach', 'remind', 'congratulate', 'rest', 'work',
      'companion.project.workspace-upgrade.complete',
      'companion.project.workspace-upgrade.progress',
      'companion.recovery.completed',
      'companion.session.productive-complete',
      'companion.momentum.strong',
      'companion.goal.gentle-reminder',
      'companion.momentum.low',
      'companion.observe',
    ),
    renderMode,
  }),
  edit_mode_opened: schema({
    sceneId: oneOf(
      'office-corner', 'formal-workstation', 'small-office', 'mid-office',
      'rough-room', 'upgraded-rental', 'buy-back-rental',
    ),
    ownedCountBand: oneOf('0', '1-4', '5-9', '10+'),
  }),
  quest_completed: schema({
    questType: oneOf('daily-main-focus'),
    effectiveDate: isoDateValue,
    sourceCategory,
  }),
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
  const propertySchema = EVENT_SCHEMAS[eventName];
  if (!propertySchema) return null;

  const sanitized = { schemaVersion: SCHEMA_VERSION };
  Object.entries(propertySchema).forEach(([key, sanitize]) => {
    const value = sanitize(properties[key]);
    if (value !== undefined) sanitized[key] = value;
  });
  if (Object.keys(propertySchema).some(key => !(key in sanitized))) return null;

  const occurredAt = normalizeOccurredAt(options.occurredAt);
  const eventSequence = sequence += 1;
  const suppliedRetryKey = typeof options.eventId === 'string' && options.eventId.length <= 160
    ? options.eventId
    : '';
  const retryKey = suppliedRetryKey || `${eventName}:${occurredAt}:${eventSequence}`;
  if (emittedEventIds.has(retryKey)) return null;
  emittedEventIds.add(retryKey);
  if (emittedEventIds.size > 500) emittedEventIds.delete(emittedEventIds.values().next().value);

  const event = Object.freeze({
    // Keep caller retry keys local. A future external adapter receives an id
    // derived only from trusted event metadata and a local sequence.
    eventId: `psv2:${eventName}:${hashEventKey(`${eventName}:${occurredAt}:${eventSequence}`)}`,
    eventName,
    occurredAt,
    properties: Object.freeze(sanitized),
  });
  try { adapter.emit(event); } catch { /* Telemetry must never affect product behavior. */ }
  return event;
}

function normalizeOccurredAt(value) {
  if (typeof value === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
      && Number.isFinite(Date.parse(value))) {
    return value;
  }
  return new Date().toISOString();
}

function schema(definition) {
  return Object.freeze(definition);
}

function oneOf(...allowedValues) {
  const allowed = new Set(allowedValues);
  return value => (allowed.has(value) ? value : undefined);
}

function numberInRange(min, max, integer = false) {
  return value => (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= min
    && value <= max
    && (!integer || Number.isInteger(value))
      ? value
      : undefined
  );
}

function booleanValue(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function isoDateValue(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : undefined;
}

function hashEventKey(value) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return [left, right]
    .map(part => (part >>> 0).toString(16).padStart(8, '0'))
    .join('');
}
