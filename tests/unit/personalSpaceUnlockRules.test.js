/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  MEMORY_PROPERTY_KIND,
  MEMORY_PROPERTY_RULES,
  getAvailableSceneOptions,
  getGraduatedMemoryScenes,
  getMemoryPropertyRule,
  getUnlockedMemoryScenes,
  isMemoryScene,
} from '../../pwa/js/personalSpace/unlockRules.js';

describe('MEMORY_PROPERTY_KIND', () => {
  it('defines GRADUATED and BUYBACK kinds', () => {
    expect(MEMORY_PROPERTY_KIND.GRADUATED).toBe('graduated');
    expect(MEMORY_PROPERTY_KIND.BUYBACK).toBe('buyback');
  });
});

describe('MEMORY_PROPERTY_RULES', () => {
  it('covers all four graduated office scenes with npcPresence', () => {
    const graduated = MEMORY_PROPERTY_RULES.filter(r => r.kind === MEMORY_PROPERTY_KIND.GRADUATED);
    const sceneIds = graduated.map(r => r.sceneId);

    expect(sceneIds).toContain('office-corner');
    expect(sceneIds).toContain('formal-workstation');
    expect(sceneIds).toContain('small-office');
    expect(sceneIds).toContain('mid-office');
    graduated.forEach(r => expect(r.npcPresence).toBe(true));
  });

  it('covers the buy-back-rental as a BUYBACK scene without npcPresence', () => {
    const buyback = MEMORY_PROPERTY_RULES.find(r => r.sceneId === 'buy-back-rental');
    expect(buyback).toBeDefined();
    expect(buyback.kind).toBe(MEMORY_PROPERTY_KIND.BUYBACK);
    expect(buyback.acquireLevel).toBe(80);
    expect(buyback.npcPresence).toBe(false);
  });

  it('graduation levels match the unlock levels of the next scene tier', () => {
    const rule = id => MEMORY_PROPERTY_RULES.find(r => r.sceneId === id);
    expect(rule('office-corner').graduatesAtLevel).toBe(15);
    expect(rule('formal-workstation').graduatesAtLevel).toBe(20);
    expect(rule('small-office').graduatesAtLevel).toBe(30);
    expect(rule('mid-office').graduatesAtLevel).toBe(40);
  });
});

describe('getGraduatedMemoryScenes', () => {
  it('returns empty array before any graduation level', () => {
    expect(getGraduatedMemoryScenes(10)).toHaveLength(0);
    expect(getGraduatedMemoryScenes(14)).toHaveLength(0);
  });

  it('returns office-corner once player reaches level 15', () => {
    const scenes = getGraduatedMemoryScenes(15);
    const ids = scenes.map(s => s.id);
    expect(ids).toContain('office-corner');
    expect(ids).not.toContain('formal-workstation');
  });

  it('accumulates more scenes as level increases', () => {
    expect(getGraduatedMemoryScenes(20).map(s => s.id)).toContain('formal-workstation');
    expect(getGraduatedMemoryScenes(40)).toHaveLength(4);
  });

  it('enriches each scene with memoryProperty, memoryKind, and npcPresence', () => {
    const scene = getGraduatedMemoryScenes(15).find(s => s.id === 'office-corner');
    expect(scene.memoryProperty).toBe(true);
    expect(scene.memoryKind).toBe(MEMORY_PROPERTY_KIND.GRADUATED);
    expect(scene.npcPresence).toBe(true);
  });
});

describe('isMemoryScene', () => {
  it('returns false for a scene with no memory rule', () => {
    expect(isMemoryScene('estate-hall', 50)).toBe(false);
    expect(isMemoryScene('rough-room', 99)).toBe(false);
  });

  it('returns false for graduated scenes before graduation level', () => {
    expect(isMemoryScene('office-corner', 14)).toBe(false);
  });

  it('returns true for graduated scenes at or above graduation level', () => {
    expect(isMemoryScene('office-corner', 15)).toBe(true);
    expect(isMemoryScene('mid-office', 40)).toBe(true);
  });

  it('returns true for buy-back-rental at acquireLevel', () => {
    expect(isMemoryScene('buy-back-rental', 79)).toBe(false);
    expect(isMemoryScene('buy-back-rental', 80)).toBe(true);
  });
});

describe('getMemoryPropertyRule', () => {
  it('returns the rule for a known memory scene', () => {
    const rule = getMemoryPropertyRule('office-corner');
    expect(rule).not.toBeNull();
    expect(rule.id).toBe('office-corner-memory');
  });

  it('returns null for scenes with no memory rule', () => {
    expect(getMemoryPropertyRule('rough-room')).toBeNull();
    expect(getMemoryPropertyRule('estate-hall')).toBeNull();
  });
});

describe('getUnlockedMemoryScenes buyback gate', () => {
  it('does NOT return buy-back-rental at Lv.80 when not in ownedItems', () => {
    const scenes = getUnlockedMemoryScenes(80, []);
    expect(scenes.map(s => s.id)).not.toContain('buy-back-rental');
  });

  it('returns buy-back-rental at Lv.80 when present in ownedItems (string form)', () => {
    const scenes = getUnlockedMemoryScenes(80, ['buy-back-rental']);
    expect(scenes.map(s => s.id)).toContain('buy-back-rental');
  });

  it('returns buy-back-rental at Lv.80 when present in ownedItems (object form)', () => {
    const scenes = getUnlockedMemoryScenes(80, [{ id: 'buy-back-rental' }]);
    expect(scenes.map(s => s.id)).toContain('buy-back-rental');
  });

  it('does not gate graduated scenes behind ownedItems', () => {
    const scenes = getUnlockedMemoryScenes(80, []);
    // buy-back-rental filtered out, but graduated scenes are not present in getUnlockedMemoryScenes anyway
    expect(scenes.every(s => s.id !== 'buy-back-rental')).toBe(true);
  });
});

describe('getAvailableSceneOptions buyback gate', () => {
  it('does NOT include buy-back-rental at Lv.80 without ownedItems', () => {
    const options = getAvailableSceneOptions(80);
    expect(options.map(o => o.id)).not.toContain('buy-back-rental');
  });

  it('includes buy-back-rental at Lv.80 when owned', () => {
    const options = getAvailableSceneOptions(80, { ownedItems: ['buy-back-rental'] });
    expect(options.map(o => o.id)).toContain('buy-back-rental');
  });
});
