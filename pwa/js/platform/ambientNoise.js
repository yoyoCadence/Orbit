// Ambient noise level adapter (HW-106).
// Reads only the microphone's instantaneous volume to label the focus
// environment quiet / normal / noisy. Nothing is recorded, buffered beyond one
// analyser frame, persisted, or sent anywhere: there is no MediaRecorder and no
// storage write in this module. stop() ends every microphone track, so the
// browser's recording indicator turns off as soon as the caller stops.

// dBFS thresholds on the smoothed RMS level. They are relative, uncalibrated
// figures: phone microphones differ, so the labels describe the environment
// roughly rather than measuring sound pressure.
export const AMBIENT_THRESHOLDS = Object.freeze({ quietBelow: -50, noisyAbove: -30 });

export function supportsAmbientNoise() {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof window !== 'undefined'
    && typeof (window.AudioContext || window.webkitAudioContext) === 'function';
}

/** @returns {'quiet'|'normal'|'noisy'} */
export function classifyAmbientLevel(dbfs, thresholds = AMBIENT_THRESHOLDS) {
  if (!Number.isFinite(dbfs) || dbfs < thresholds.quietBelow) return 'quiet';
  if (dbfs > thresholds.noisyAbove) return 'noisy';
  return 'normal';
}

/** RMS of a time-domain frame (-1..1 floats) in dBFS; silence is -Infinity. */
export function rmsToDbfs(samples) {
  if (!samples?.length) return -Infinity;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * Starts sampling. Prompts for microphone permission on first use.
 * @param {{onLevel: (state: {level: string, dbfs: number}) => void, intervalMs?: number}} options
 * @returns {Promise<{stop: () => void}>} rejects when permission is denied or
 *   audio is unavailable; the caller shows its own message.
 */
export async function startAmbientNoiseMonitor({ onLevel, intervalMs = 500 } = {}) {
  if (!supportsAmbientNoise()) throw new Error('ambient-noise-unsupported');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false,
  });

  let context = null;
  let timerId = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timerId) clearInterval(timerId);
    stream.getTracks().forEach(track => track.stop());
    context?.close?.().catch?.(() => {});
  };

  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const frame = new Float32Array(analyser.fftSize);

    // Exponential smoothing keeps a single cough from flipping the label.
    let smoothed = null;
    timerId = setInterval(() => {
      analyser.getFloatTimeDomainData(frame);
      const dbfs = Math.max(-100, rmsToDbfs(frame));
      smoothed = smoothed === null ? dbfs : smoothed * 0.7 + dbfs * 0.3;
      onLevel?.({ level: classifyAmbientLevel(smoothed), dbfs: smoothed });
    }, intervalMs);
  } catch (error) {
    stop();
    throw error;
  }

  return { stop };
}
