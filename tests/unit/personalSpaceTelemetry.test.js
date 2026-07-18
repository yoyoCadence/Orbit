import { afterEach, describe, expect, it } from 'vitest';
import {
  createLocalTelemetryAdapter,
  emitPersonalSpaceTelemetry,
  setPersonalSpaceTelemetryAdapter,
} from '../../pwa/js/personalSpace/v2/telemetry.js';

afterEach(() => setPersonalSpaceTelemetryAdapter(null));

describe('Personal Space V2 telemetry contract', () => {
  it('keeps only allowlisted, non-sensitive properties', () => {
    const local = createLocalTelemetryAdapter();
    setPersonalSpaceTelemetryAdapter(local);

    emitPersonalSpaceTelemetry('orbit_window_opened', {
      entryPoint: 'home-window',
      projectPhase: 'workstation',
      taskName: 'private task title',
      email: 'private@example.com',
    }, { eventId: 'telemetry-safe-1', occurredAt: '2026-07-18T00:00:00.000Z' });

    expect(local.getEvents()).toEqual([expect.objectContaining({
      eventId: 'telemetry-safe-1',
      properties: {
        schemaVersion: 1,
        entryPoint: 'home-window',
        projectPhase: 'workstation',
      },
    })]);
  });

  it('deduplicates retry ids and rejects incomplete event payloads', () => {
    const local = createLocalTelemetryAdapter();
    setPersonalSpaceTelemetryAdapter(local);
    const properties = { entryPoint: 'home-window', projectPhase: 'bare' };

    expect(emitPersonalSpaceTelemetry('orbit_window_opened', properties, { eventId: 'dedup-1' }))
      .not.toBeNull();
    expect(emitPersonalSpaceTelemetry('orbit_window_opened', properties, { eventId: 'dedup-1' }))
      .toBeNull();
    expect(emitPersonalSpaceTelemetry('orbit_window_opened', { entryPoint: 'home-window' }))
      .toBeNull();
    expect(local.getEvents()).toHaveLength(1);
  });

  it('never lets an adapter failure affect product behavior', () => {
    setPersonalSpaceTelemetryAdapter({ emit: () => { throw new Error('adapter unavailable'); } });

    expect(() => emitPersonalSpaceTelemetry('companion_interacted', {
      companionState: 'observe',
      interactionKey: 'observe',
      renderMode: 'home-window',
    }, { eventId: 'adapter-failure-1' })).not.toThrow();
  });
});
