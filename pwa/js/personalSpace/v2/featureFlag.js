import { FLAG_PERSONAL_SPACE_RUNTIME } from '../../flags.js';
import {
  DEFAULT_PERSONAL_SPACE_RUNTIME,
  PERSONAL_SPACE_RUNTIME,
} from './config.js';

export function normalizePersonalSpaceRuntime(value) {
  return Object.values(PERSONAL_SPACE_RUNTIME).includes(value)
    ? value
    : DEFAULT_PERSONAL_SPACE_RUNTIME;
}

export function getPersonalSpaceRuntime() {
  try {
    return normalizePersonalSpaceRuntime(localStorage.getItem(FLAG_PERSONAL_SPACE_RUNTIME));
  } catch {
    return DEFAULT_PERSONAL_SPACE_RUNTIME;
  }
}

export function setPersonalSpaceRuntime(runtime) {
  if (!Object.values(PERSONAL_SPACE_RUNTIME).includes(runtime)) {
    throw new TypeError(`Unsupported Personal Space runtime: ${runtime}`);
  }

  localStorage.setItem(FLAG_PERSONAL_SPACE_RUNTIME, runtime);
  return runtime;
}

export function isPersonalSpaceV2Enabled() {
  return getPersonalSpaceRuntime() === PERSONAL_SPACE_RUNTIME.V2;
}
