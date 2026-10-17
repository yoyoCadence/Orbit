/**
 * @vitest-environment jsdom
 */
/**
 * ambientNoise.test.js — HW-106：環境噪音只讀音量、不錄音，停止時關閉麥克風。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AMBIENT_THRESHOLDS,
  classifyAmbientLevel,
  rmsToDbfs,
  startAmbientNoiseMonitor,
  supportsAmbientNoise,
} from '../../pwa/js/platform/ambientNoise.js';

describe('classifyAmbientLevel', () => {
  it('依門檻分成 quiet／normal／noisy', () => {
    expect(classifyAmbientLevel(-70)).toBe('quiet');
    expect(classifyAmbientLevel(AMBIENT_THRESHOLDS.quietBelow)).toBe('normal');
    expect(classifyAmbientLevel(-40)).toBe('normal');
    expect(classifyAmbientLevel(AMBIENT_THRESHOLDS.noisyAbove)).toBe('normal');
    expect(classifyAmbientLevel(-20)).toBe('noisy');
  });

  it('無效數值（含完全靜音 -Infinity）視為 quiet', () => {
    expect(classifyAmbientLevel(-Infinity)).toBe('quiet');
    expect(classifyAmbientLevel(NaN)).toBe('quiet');
  });
});

describe('rmsToDbfs', () => {
  it('滿刻度方波為 0 dBFS，靜音為 -Infinity', () => {
    expect(rmsToDbfs(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(0, 5);
    expect(rmsToDbfs(new Float32Array(8))).toBe(-Infinity);
    expect(rmsToDbfs(new Float32Array([0.1, -0.1]))).toBeCloseTo(-20, 5);
  });
});

describe('startAmbientNoiseMonitor', () => {
  let tracks;
  let closeContext;
  let sampleValue;

  beforeEach(() => {
    vi.useFakeTimers();
    tracks = [{ stop: vi.fn() }];
    closeContext = vi.fn(() => Promise.resolve());
    sampleValue = 0.001;   // -60 dBFS → quiet
    const stream = { getTracks: () => tracks };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => Promise.resolve(stream)) },
    });
    window.AudioContext = vi.fn(() => ({
      createAnalyser: () => ({
        fftSize: 0,
        getFloatTimeDomainData: frame => frame.fill(sampleValue),
      }),
      createMediaStreamSource: () => ({ connect: vi.fn() }),
      close: closeContext,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.AudioContext;
  });

  it('只要求音訊、不要求影像，且週期回報分類後的等級', async () => {
    expect(supportsAmbientNoise()).toBe(true);
    const levels = [];
    const monitor = await startAmbientNoiseMonitor({ onLevel: state => levels.push(state.level), intervalMs: 100 });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: false, audio: expect.any(Object) }),
    );
    vi.advanceTimersByTime(100);
    expect(levels).toEqual(['quiet']);

    sampleValue = 0.5;   // ≈ -6 dBFS；平滑後在幾個 tick 內轉為 noisy
    vi.advanceTimersByTime(1000);
    expect(levels.at(-1)).toBe('noisy');
    monitor.stop();
  });

  it('stop() 關閉所有麥克風 track 與 AudioContext，之後不再回報，且可重複呼叫', async () => {
    const onLevel = vi.fn();
    const monitor = await startAmbientNoiseMonitor({ onLevel, intervalMs: 100 });
    monitor.stop();
    monitor.stop();

    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(onLevel).not.toHaveBeenCalled();
  });

  it('權限被拒時直接拋出，不留下任何資源', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    await expect(startAmbientNoiseMonitor({ onLevel: vi.fn() })).rejects.toThrow('denied');
    expect(window.AudioContext).not.toHaveBeenCalled();
  });

  it('AudioContext 建立失敗時仍會關閉已取得的麥克風', async () => {
    window.AudioContext = vi.fn(() => { throw new Error('audio-unavailable'); });
    await expect(startAmbientNoiseMonitor({ onLevel: vi.fn() })).rejects.toThrow('audio-unavailable');
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  });
});
