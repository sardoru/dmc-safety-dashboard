import { useSyncExternalStore } from 'react';

/**
 * A shared ticking clock for relative times ("4m ago"). Reading Date.now()
 * during render is impure; this keeps the value in an external store that
 * ticks for every subscriber at once.
 */
let now = Date.now();
const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return now;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Force the shared clock forward (e.g. right after creating something). */
export function bumpNow() {
  now = Date.now();
  listeners.forEach((l) => l());
}
