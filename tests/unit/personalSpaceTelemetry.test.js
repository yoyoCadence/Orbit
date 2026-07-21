import { afterEach, describe, expect, it } from 'vitest';
import {
  createLocalTelemetryAdapter,
  emitPersonalSpaceTelemetry,
  setPersonalSpaceTelemetryAdapter,
} from '../../pwa/js/personalSpace/v2/telemetry.js';
import { SCENE_IDS } from '../../pwa/js/personalSpace/unlockRules.js';

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

  it('accepts edit_mode_opened for every canonical scene, including estate/manager/memory', () => {
    const local = createLocalTelemetryAdapter({ limit: SCENE_IDS.length });
    setPersonalSpaceTelemetryAdapter(local);

    // The high-level scenes a stale hand-written allowlist previously dropped.
    expect(SCENE_IDS).toEqual(expect.arrayContaining([
      'manager-room', 'large-office-suite',
      'estate-hall', 'estate-study', 'estate-lounge', 'estate-game-room',
      'buy-back-rental',
    ]));

    SCENE_IDS.forEach((sceneId, index) => {
      expect(
        emitPersonalSpaceTelemetry('edit_mode_opened', { sceneId, ownedCountBand: '5-9' }, {
          eventId: `scene-${index}`,
          occurredAt: '2026-07-18T00:00:00.000Z',
        }),
        `expected edit_mode_opened to accept canonical scene "${sceneId}"`,
      ).not.toBeNull();
    });

    expect(local.getEvents().map(event => event.properties.sceneId)).toEqual([...SCENE_IDS]);
  });

  it('drops edit_mode_opened only for scene ids outside the canonical inventory', () => {
    expect(emitPersonalSpaceTelemetry('edit_mode_opened', {
      sceneId: 'not-a-real-scene',
      ownedCountBand: '0',
    })).toBeNull();
  });

  it('rejects calendar-invalid effectiveDate and only accepts real dates', () => {
    const invalidDates = ['2026-02-31', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31'];
    invalidDates.forEach(effectiveDate => {
      expect(
        emitPersonalSpaceTelemetry('quest_completed', {
          questType: 'daily-main-focus', effectiveDate, sourceCategory: 'task',
        }, { eventId: `bad-date-${effectiveDate}` }),
        `expected ${effectiveDate} to fail closed`,
      ).toBeNull();
    });

    const validDates = ['2024-02-29', '2026-02-28', '2026-12-31'];
    validDates.forEach((effectiveDate, index) => {
      const event = emitPersonalSpaceTelemetry('quest_completed', {
        questType: 'daily-main-focus', effectiveDate, sourceCategory: 'task',
      }, { eventId: `good-date-${index}`, occurredAt: '2026-07-18T00:00:00.000Z' });
      expect(event, `expected ${effectiveDate} to be accepted`).not.toBeNull();
      expect(event.properties.effectiveDate).toBe(effectiveDate);
    });
  });

  it('never passes an overflowed occurredAt through and canonicalizes valid ones', () => {
    const local = createLocalTelemetryAdapter();
    setPersonalSpaceTelemetryAdapter(local);
    const base = { entryPoint: 'home-window', projectPhase: 'basic-desk' };

    // 2026-02-31 parses to 2026-03-03 in JavaScript; it must not survive as-is.
    const overflowed = emitPersonalSpaceTelemetry('orbit_window_opened', base, {
      eventId: 'overflow-ts', occurredAt: '2026-02-31T00:00:00.000Z',
    });
    expect(overflowed.occurredAt).not.toBe('2026-02-31T00:00:00.000Z');
    expect(overflowed.occurredAt).not.toBe('2026-03-03T00:00:00.000Z');
    expect(overflowed.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // A valid instant without milliseconds is canonicalized via toISOString().
    const canonical = emitPersonalSpaceTelemetry('orbit_window_opened', base, {
      eventId: 'canonical-ts', occurredAt: '2026-07-18T09:30:00Z',
    });
    expect(canonical.occurredAt).toBe('2026-07-18T09:30:00.000Z');
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
