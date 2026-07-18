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
      projectPhase: 'basic-desk',
      taskName: 'private task title',
      email: 'private@example.com',
    }, { eventId: 'telemetry-safe-1', occurredAt: '2026-07-18T00:00:00.000Z' });

    expect(local.getEvents()).toEqual([expect.objectContaining({
      eventId: expect.stringMatching(/^psv2:orbit_window_opened:[a-f0-9]{16}$/),
      occurredAt: '2026-07-18T00:00:00.000Z',
      properties: {
        schemaVersion: 1,
        entryPoint: 'home-window',
        projectPhase: 'basic-desk',
      },
    })]);
  });

  it('deduplicates retry ids and rejects incomplete event payloads', () => {
    const local = createLocalTelemetryAdapter();
    setPersonalSpaceTelemetryAdapter(local);
    const properties = { entryPoint: 'home-window', projectPhase: 'empty-work-corner' };

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

  it('accepts every contracted event with categorical, privacy-safe values', () => {
    const local = createLocalTelemetryAdapter({ limit: 20 });
    setPersonalSpaceTelemetryAdapter(local);
    const events = [
      ['orbit_window_viewed', { renderPath: 'pixi', projectPhase: 'basic-desk', runtimeReady: true }],
      ['orbit_window_opened', { entryPoint: 'home-window', projectPhase: 'basic-desk' }],
      ['personal_space_loaded', {
        renderMode: 'full-world', renderPath: 'v2-pixi', loadMs: 180, projectPhase: 'basic-desk',
      }],
      ['reward_reveal_started', {
        rewardBatchType: 'settlement', revealClass: 'medium', renderMode: 'home-window', reducedMotion: false,
      }],
      ['reward_reveal_completed', {
        rewardBatchType: 'settlement', revealClass: 'medium', renderMode: 'home-window',
        reducedMotion: false, durationMs: 4200, completionMode: 'timer',
      }],
      ['project_progressed', {
        projectId: 'workspace-upgrade', fromPhase: 'empty-work-corner',
        toPhase: 'basic-desk', sourceCategory: 'main-quest',
      }],
      ['project_completed', { projectId: 'workspace-upgrade', sourceCategory: 'main-quest' }],
      ['companion_interacted', {
        companionState: 'observe', interactionKey: 'companion.momentum.low', renderMode: 'home-window',
      }],
      ['edit_mode_opened', { sceneId: 'office-corner', ownedCountBand: '10+' }],
      ['quest_completed', {
        questType: 'daily-main-focus', effectiveDate: '2026-07-18', sourceCategory: 'task',
      }],
    ];

    events.forEach(([eventName, properties], index) => {
      expect(emitPersonalSpaceTelemetry(eventName, properties, {
        eventId: `contract-${index}`,
        occurredAt: '2026-07-18T00:00:00.000Z',
      })).not.toBeNull();
    });
    expect(local.getEvents()).toHaveLength(events.length);
  });

  it('rejects free-form or out-of-range values even when placed in allowlisted fields', () => {
    expect(emitPersonalSpaceTelemetry('orbit_window_opened', {
      entryPoint: 'private@example.com',
      projectPhase: 'basic-desk',
    })).toBeNull();
    expect(emitPersonalSpaceTelemetry('orbit_window_opened', {
      entryPoint: 'private-task-title',
      projectPhase: 'basic-desk',
    })).toBeNull();
    expect(emitPersonalSpaceTelemetry('personal_space_loaded', {
      renderMode: 'full-world',
      renderPath: 'v2-pixi',
      loadMs: -1,
      projectPhase: 'basic-desk',
    })).toBeNull();
  });

  it('keeps retry keys opaque and normalizes untrusted timestamps', () => {
    const local = createLocalTelemetryAdapter();
    setPersonalSpaceTelemetryAdapter(local);

    const event = emitPersonalSpaceTelemetry('orbit_window_opened', {
      entryPoint: 'home-window',
      projectPhase: 'empty-work-corner',
    }, {
      eventId: 'private@example.com',
      occurredAt: 'private timestamp',
    });

    expect(event.eventId).toMatch(/^psv2:orbit_window_opened:[a-f0-9]{16}$/);
    expect(event.eventId).not.toContain('private');
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.occurredAt).not.toContain('private');
  });

  it('bounds the local adapter without exposing mutable event copies', () => {
    const local = createLocalTelemetryAdapter({ limit: 2 });
    setPersonalSpaceTelemetryAdapter(local);
    const phases = ['empty-work-corner', 'basic-desk', 'light-and-storage'];
    for (let index = 0; index < phases.length; index += 1) {
      emitPersonalSpaceTelemetry('orbit_window_opened', {
        entryPoint: 'home-window',
        projectPhase: phases[index],
      }, { eventId: `bounded-${index}` });
    }

    const events = local.getEvents();
    expect(events).toHaveLength(2);
    events[0].properties.projectPhase = 'private-task-title';
    expect(local.getEvents()[0].properties.projectPhase).toBe('basic-desk');
  });
});
