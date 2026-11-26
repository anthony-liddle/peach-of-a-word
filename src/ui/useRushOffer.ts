import { useSyncExternalStore } from 'react';

/**
 * Offer Peach rush: whether the board opens on the start each day, Play and
 * Peach rush, while the run is offered. On by default (Antoine, 25 November).
 * Off, a player who never wants the run goes straight to the board, with no
 * start and no button offering it; a run already started or played today
 * stays reachable from the toolbar.
 *
 * Kept per browser under its own key, written as "on" or "off". Anything but
 * "off", or nothing, reads as on. Only Settings writes it, and Settings shows
 * it only while Peach rush is shown.
 */
export const RUSH_OFFER_KEY = 'e8-rush-offer';

const listeners = new Set<() => void>();

/**
 * The last choice, held only when storage refused to keep it, so the switch
 * still works for the visit. Null whenever storage has it.
 */
let unsaved: boolean | null = null;

function readRushOffer(): boolean {
  try {
    const saved = localStorage.getItem(RUSH_OFFER_KEY);
    if (saved !== null) return saved !== 'off';
  } catch {
    // Storage blocked: fall through to this visit's choice, if any.
  }
  return unsaved ?? true;
}

function setRushOffer(on: boolean): void {
  try {
    localStorage.setItem(RUSH_OFFER_KEY, on ? 'on' : 'off');
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

export function useRushOffer(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readRushOffer, serverSnapshot);
  return [on, setRushOffer];
}
