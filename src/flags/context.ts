import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Board, Flag, Flags } from './flags.ts';

/**
 * What a card's flag needs from the game: this device's flags, the board the
 * card belongs to, and a way to Your flags. Game provides it. Where it's
 * absent (the dev probe, a card rendered alone in a test), no flag shows.
 */
export interface FlagsUI {
  flags: Flags;
  /** The daily's day, or the web Endless's rack. */
  board: Board | null;
  mode: 'daily' | 'endless';
  /** Opens Your flags over whatever is open, and gives focus back to `trigger` after. */
  openYourFlags: (trigger: HTMLElement) => void;
}

export const FlagsContext = createContext<FlagsUI | null>(null);

export function useFlagsUI(): FlagsUI | null {
  return useContext(FlagsContext);
}

const none = () => () => {};
const EMPTY: readonly Flag[] = [];

/** This device's flags, re-rendering whenever the list changes. */
export function useFlagList(flags: Flags | null): readonly Flag[] {
  useSyncExternalStore(
    flags ? flags.subscribe : none,
    () => flags?.snapshot() ?? EMPTY,
  );
  return flags ? flags.list() : EMPTY;
}
