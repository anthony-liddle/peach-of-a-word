import { useSyncExternalStore } from 'react';

/**
 * Word counts by length: whether the found list shows every length in the
 * basket from the first find, each with its count ("5 letters, 0 of 2"), or a
 * length only once a word that long is found. On by default; Bea turns it off
 * for the harder game (Antoine and Bea, 21 November 2026). The basket's total,
 * "12 of 37 words", shows either way.
 *
 * Kept per browser under its own key, written as "on" or "off". Anything but
 * "off", or nothing, reads as on, so a visitor who never touched it sees the
 * counts.
 */
const STORAGE_KEY = 'e8-length-counts';

const listeners = new Set<() => void>();

/**
 * The last choice, held only when storage refused to keep it, so the switch
 * still works for the visit. Null whenever storage has it.
 */
let unsaved: boolean | null = null;

function readLengthCounts(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved !== 'off';
  } catch {
    // Storage blocked: fall through to this visit's choice, if any.
  }
  return unsaved ?? true;
}

function setLengthCounts(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
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

const serverSnapshot = (): boolean => true;

/**
 * Read synchronously at the first render, so a reload with the setting off
 * never draws the unfound lengths for a frame first.
 */
export function useLengthCounts(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readLengthCounts, serverSnapshot);
  return [on, setLengthCounts];
}
