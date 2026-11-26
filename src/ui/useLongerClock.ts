import { useSyncExternalStore } from 'react';

/**
 * Longer clock: Peach rush at 3:00 instead of 1:30, off by default, as the
 * app has it. Read at Start, so a run keeps the length it began with.
 *
 * Kept per browser under its own key, written as "on" or "off". Anything but
 * "on", or nothing, reads as off. Only Settings writes it, and Settings shows
 * it only while Peach rush is shown.
 */
export const LONGER_CLOCK_KEY = 'e8-longer-clock';

const listeners = new Set<() => void>();

/**
 * The last choice, held only when storage refused to keep it, so the switch
 * still works for the visit. Null whenever storage has it.
 */
let unsaved: boolean | null = null;

function readLongerClock(): boolean {
  try {
    const saved = localStorage.getItem(LONGER_CLOCK_KEY);
    if (saved !== null) return saved === 'on';
  } catch {
    // Storage blocked: fall through to this visit's choice, if any.
  }
  return unsaved ?? false;
}

function setLongerClock(on: boolean): void {
  try {
    localStorage.setItem(LONGER_CLOCK_KEY, on ? 'on' : 'off');
    unsaved = null;
  } catch {
    unsaved = on;
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const serverSnapshot = (): boolean => false;

export function useLongerClock(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readLongerClock, serverSnapshot);
  return [on, setLongerClock];
}
