import { TURING_PRESET, type Params } from './model';

export const state: Params = { ...TURING_PRESET };

const listeners = new Set<() => void>();

export function subscribe(f: () => void) {
  listeners.add(f);
}

export function update(patch: Partial<Params>) {
  Object.assign(state, patch);
  listeners.forEach((f) => f());
}

/** Run f at most once per `ms` of quiet after the last change. */
export function debounce(f: () => void, ms: number) {
  let id = 0;
  return () => {
    clearTimeout(id);
    id = window.setTimeout(f, ms);
  };
}
